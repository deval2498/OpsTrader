import express from "express"
import type { Request, RequestHandler, Response, NextFunction } from "express"
import config from './config'
import Queue from "bull"
import {createClient} from "redis"

const app = express()

const port = config.PORT

const client = createClient()


const myQueue = new Queue('queue_1', {
  redis: {
    host: config.REDIS_HOST,
    port: Number(config.REDIS_PORT),
    password: config.REDIS_PASSWORD === "undefined" ? undefined : config.REDIS_PASSWORD
  },
});

myQueue.on("error", async (err) => {
  console.error("Queue encountered an error:", err.message, config.REDIS_PORT);
  try {
    await myQueue.close(); // Close current connection
    await myQueue.isReady(); // Wait for reconnection
  } catch (reconnectError) {
    console.error("Error reconnecting to queue:", reconnectError);
  }
});

interface User {
  balance: number;
  locked: number;
}

interface StockBalance {
  yes: { quantity: number; locked: number };
  no: { quantity: number; locked: number };
}

interface Symbol {
  yes: number;
  no: number;
}

type OrderType = "normal" | "reverse";

type OrderTradeRequest = {
  userId: string;
  stockSymbol: string;
  quantity: number;
  price: number;
  stockType: 'yes' | 'no';
}

let users: Record<string, User> = {};
let stockBalances: Record<string, Record<string, StockBalance>> = {};
let symbols: Record<string, Symbol> = {};
let orders: Record<string, Record<string, { [key: number]: { total: number; orders: Record<string, { userId: string, quantity: number, filled: number, type: OrderType }> } }>> = {};


// Utility Functions
const getUser = (userId: string) => users[userId];
const getSymbol = (symbol: string) => symbols[symbol];
function createTupleKey(userId: string, type: OrderType): string {
  return `${userId}_${type}`; // Concatenate string and order type
}

const validateUserExists:RequestHandler = (req:Request, res: Response, next: NextFunction) => {
    const { userId } = req.body;
  
    // Check if the user exists
    if (!users[userId]) {
      res.status(404).json({ message: `User ${userId} not found` });
      return
    }
  
    // Proceed to the next middleware if the user exists
    next();
  };

  const validateSymbolExists: RequestHandler = (req, res, next) => {
    const { stockSymbol } = req.body;
  
    // Check if the symbol exists
    if (!symbols[stockSymbol]) {
      res.status(404).json({ message: `Symbol ${stockSymbol} not found` });
      return;
    }
  
    // Proceed to the next middleware if the symbol exists
    next();
  };


  const reset = () => {
    users = {};
    stockBalances = {};
    symbols = {};
    orders = {};
  };

  function createSellOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    orders[stockSymbol] = orders[stockSymbol] || {
      yes: {
      },
      no: {
      }
    }
    orders[stockSymbol][stockType][price] = orders[stockSymbol][stockType][price] || {
      orders: {},
      total: 0
    }
    orders[stockSymbol][stockType][price].total += quantity
    orders[stockSymbol][stockType][price].orders[userId] = {
      userId: userId,
      quantity: quantity,
      filled: 0,
      type: "normal"
    }
    return
  }

  function checkSellOrders(stockSymbol: string, stockType: "yes" | "no", price: number) {
    const stockOrders = orders[stockSymbol][stockType]
    const response:{
      [price: number]: {
        [userId: string] : number
      }
    } = {}
    for(const orderPrice in stockOrders) {
      if(parseInt(orderPrice) <= price) {
        for(const user in orders[stockSymbol][stockType][orderPrice].orders) {
          response[orderPrice] = response[orderPrice] || {}
          response[orderPrice][user] = orders[stockSymbol][stockType][orderPrice].orders[user].quantity - orders[stockSymbol][stockType][orderPrice].orders[user].quantity
        }
      }
    }
    return response
  }

  function createReverseOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    orders[stockSymbol] = orders[stockSymbol] || {
      yes: {
      },
      no: {
      }
    }
    orders[stockSymbol][stockType][price] = orders[stockSymbol][stockType][price] || {
      orders: {},
      total: 0
    }
    orders[stockSymbol][stockType][price].total += quantity
    orders[stockSymbol][stockType][price].orders[userId] = {
      userId: userId,
      quantity: quantity,
      filled: 0,
      type: "reverse"
    }
    return
  }

  function executeBuyOrderIfExists(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    const sellOrderList = checkSellOrders(stockSymbol, stockType, price)
    let qtyFilled = 0
    const filledOrderList: {[userId: string]: number} = {}
    if(Object.keys(sellOrderList).length > 0) {
      // execute orders

      // sorted low to high
      const sortedPriceList = Object.keys(sellOrderList).map((x) => parseInt(x)).sort((a , b) => a - b)
      for(const orderPrice in sortedPriceList) {
        for(const user in sellOrderList[orderPrice]) {
          if(sellOrderList[orderPrice][user] >= quantity - qtyFilled) {
            //order complete
            matchNormalOrder(userId, user, stockSymbol, stockType, quantity - qtyFilled, parseInt(orderPrice))
            qtyFilled = quantity
            filledOrderList[user] = filledOrderList[user] || 0
            filledOrderList[user] = quantity
            
              return ["Complete", 0, filledOrderList]
            } 
            // filling partial
            matchNormalOrder(userId, user, stockSymbol, stockType, sellOrderList[orderPrice][user], parseInt(orderPrice))
            qtyFilled += sellOrderList[orderPrice][user]
            filledOrderList[user] = filledOrderList[user] || 0
            filledOrderList[user] += sellOrderList[orderPrice][user]
          }
        }
      }
      if(qtyFilled == 0) {
        createReverseOrder(userId, stockSymbol, stockType == "yes" ? "no":"yes", quantity, 1000 - price)
        users[userId].balance -= quantity * price
        users[userId].locked += quantity * price
        return ["Incomplete", quantity, filledOrderList]
      }
      else{
        createReverseOrder(userId, stockSymbol, stockType == "yes" ? "no":"yes", quantity - qtyFilled, 1000 - price)
        users[userId].balance -= ((quantity - qtyFilled) * price)
        users[userId].locked += ((quantity - qtyFilled) * price)
        return ["Partial", quantity - qtyFilled, filledOrderList]
      }
    }


  function checkReverseOrder(stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number): {[price: number]:{[userId: string]: number}} {
      const matchingReverseOrders:{
        [price: number]: {
          [userId: string] : number
        }
      } = {}
      const reverseOrderPrice = 1000 - price
      const reverseOrderType = stockType == "yes" ? "no": "yes"
      for(const orderPrice in orders[stockSymbol][reverseOrderType]) {
        console.log("prices", price)
        if(parseInt(orderPrice) <= reverseOrderPrice) {
          // orders exist, are they reverse orders?
          for(const user in orders[stockSymbol][reverseOrderType][orderPrice].orders) {
            const userOrder = orders[stockSymbol][reverseOrderType][orderPrice].orders[user]
            if(userOrder.type == "reverse") {
              if(userOrder.quantity - userOrder.filled > 0) {
                matchingReverseOrders[orderPrice] = matchingReverseOrders[orderPrice] || {}
                matchingReverseOrders[orderPrice][user] = userOrder.quantity - userOrder.filled 
              }
            }
          }
        }
      }
      return matchingReverseOrders
  }

  function matchNormalOrder(buyer: string , orderKey: string,  stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    const orderRecord = orders[stockSymbol][stockType][price]
    const order = orders[stockSymbol][stockType][price].orders

    // change order quantities
    order[orderKey].filled += quantity
    orderRecord.total -= quantity
    if(order[orderKey].type == "reverse") {
      // mint to the userId
      mintToBuyer(order[orderKey].userId, stockSymbol, stockType == "yes" ? "no": "yes", quantity, 1000 - price)
    }
    else {
      // take stocks from seller
      stockBalances[order[orderKey].userId][stockSymbol][stockType].locked -= quantity

      // give stocks to buyer
      stockBalances[buyer][stockSymbol] = stockBalances[buyer][stockSymbol] || {
        yes: {
          quantity: 0,
          locked: 0
        },
        no: {
          quantity: 0,
          locked: 0
        }
      }
      stockBalances[buyer][stockSymbol][stockType].quantity += quantity
    }
    users[buyer].balance -= price * quantity
    if(order[orderKey].filled == order[orderKey].quantity) {
      delete order[orderKey]
      if(orderRecord.total == 0) {
        delete orders[stockSymbol][stockType][price]
      } 
    }
    return
  }

  function matchReverseOrder(orderKey: string , seller: string,  stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number): [string, number] {
    const orderRecord = orders[stockSymbol][stockType][price]
    const orderQtyLeft = orderRecord.orders[orderKey].quantity - orderRecord.orders[orderKey].filled
    const userId = orderRecord.orders[orderKey].userId
    // change order quantities, if yes give no to orderkey vice versa
    orderRecord.orders[orderKey].filled += quantity
    orderRecord.total -= quantity
    stockBalances[seller][stockSymbol][stockType == "yes" ? "no":"yes"].quantity -= quantity
    users[seller].balance += ((1000 - price)*quantity)
    users[userId].locked -= ((1000 - price)*quantity)
    if(orderQtyLeft - quantity == 0) {
      // delete the order
      delete orderRecord.orders[orderKey]
      if(orderRecord.total == 0) {
        delete orders[stockSymbol][stockType][price]
      }
    }
    return [userId, quantity]
  }

  function placeOrder(orderKey: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, type: "reverse" | "normal") {

  }

  function mintToBuyer(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    stockBalances[userId][stockSymbol] = stockBalances[userId][stockSymbol] || {
      yes: {
        quantity: 0,
        locked: 0
      },
      no: {
        quantity: 0,
        locked: 0
      }
    }
    stockBalances[userId][stockSymbol][stockType].quantity += quantity
    users[userId].locked -= price * quantity
  }

  function executeSellOrderIfReverseExists(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    // get list of reverse orders that exist
    const reverseOrderList = checkReverseOrder(stockSymbol, stockType, quantity, price)
    const buyerListAndPrices: {[userId: string]: number} = {}
    let qtySold = 0
    
    if(Object.keys(reverseOrderList).length > 0) {
      // sort highest to lowest 
      const sortedPrices = Object.keys(reverseOrderList).map((x) => Number(x)).sort((a, b) => b - a)

      // match orders, give money to seller and give stocks to multiple buyers
      for(const price in sortedPrices) {
        for(const user in reverseOrderList[price]) {
          if(reverseOrderList[price][user] >= quantity - qtySold) {
            // execute sell order for this quantity
            const response = matchReverseOrder(user, userId, stockSymbol, stockType, quantity - qtySold, Number(price))
            buyerListAndPrices[response[0]] = buyerListAndPrices[response[0]] || 0
            buyerListAndPrices[response[0]] += buyerListAndPrices[response[1]]
            return ["Complete",0, buyerListAndPrices]
          }
          else {
            let curOrderQty = reverseOrderList[price][user]
            const response = matchReverseOrder(user, userId, stockSymbol, stockType, curOrderQty, Number(price))
            buyerListAndPrices[response[0]] = buyerListAndPrices[response[0]] || 0
            buyerListAndPrices[response[0]] += buyerListAndPrices[response[1]]
            qtySold += curOrderQty
          }
          
        }
      }
    }
    if(qtySold == 0) {
      createSellOrder(userId, stockSymbol, stockType, quantity, price)
      return ["Incomplete", quantity, {}]
    }
    createSellOrder(userId, stockSymbol, stockType, quantity - qtySold, price)
    return ["Partial", quantity - qtySold, buyerListAndPrices]
  }

  // Reset route

  app.use(express.json());

  app.post('/reset', (req: Request, res: Response) => {
    reset();
    res.status(200).json({ message: 'Data reset' });
  });

  app.post('/user/create/:userId', async (req: Request, res: Response): Promise<any> => {
    const { userId } = req.params;
    const job_id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    // Connect to Redis if not already connected
    if (!client.isOpen) await client.connect();
    const responsePromise = new Promise(async (resolve) => {
      await client.subscribe("create_user_resp", (message) => {
        resolve(message)
      })
    })
    
    // Add the job to the queue and generate a unique job ID
    const jobId = await myQueue.add(
      { event: "CreateUser", userId: userId },
      { jobId: job_id }
    );
    
    // Subscribe to the Redis channel with the job ID and wait for a message
    try {
      const response = await Promise.race([
        responsePromise, // Wait for the message
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)) // 5 seconds timeout
      ]);

      //@ts-ignore
      const jsonResp = JSON.parse(response)
      
      //@ts-ignore
      if(jsonResp?.[job_id] == "ALREADY_EXISTS") {
        return res.status(400).json({
          message: `User ${userId} already exists`
        })
      }
      res.status(201).json({ message: `User ${userId} created`});
    } catch (error) {
      console.error('Error during user creation:', error);
      res.status(500).json({ message: 'Error creating user', error });
    } finally {
      // Unsubscribe and disconnect from Redis to clean up
      console.log("calling finally")
      await client.unsubscribe("create_user_resp");
    }
  });
  // const message = await new Promise<string>((resolve, reject) => {
  //   const timeout = setTimeout(() => {
  //     client.unsubscribe(String(jobId.id))
  //     reject(new Error('Data worker is not responding'))
  //   }, 4000)
  //   client.subscribe(String(jobId.id), (message) => {
  //     resolve(message)
  //   })
  // })

  // Onramp route to add balance
  app.post('/onramp/inr', async (req: Request, res: Response): Promise<any> => {
    const { userId, amount } = req.body;
  
    if (typeof amount !== "number") {
      return res.status(400).json({ message: "Please check request body" });
    }
  
    const job_id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
    if (!client.isOpen) await client.connect();
  
    // Set up the subscription and create a promise to wait for the response
    const responsePromise = new Promise(async (resolve) => {
      await client.subscribe("onramp_resp", (message) => {
        resolve(message); // Resolves when a message arrives
      });
    });
  
    // Add the job to the queue
    const jobId = await myQueue.add(
      { event: "OnrampINR", userId: userId, amount: amount },
      { jobId: job_id }
    );
  
    // Wait for the response, with a timeout
    try {
      const response = await Promise.race([
        responsePromise, // Wait for the message
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)) // 5 seconds timeout
      ]);
      //@ts-ignore
      const jsonResp = JSON.parse(response)

      //@ts-ignore
      if (jsonResp?.[job_id] === "UDNE") {
        return res.status(404).json({ message: "User does not exist" });
      }
  
      return res.status(200).json({ message: `Onramped ${userId} with amount ${amount}` });
    } catch (error) {
      return res.status(500).json({ message: "Timeout waiting for response" });
    } finally {
      client.unsubscribe("onramp_resp")
    }
  });
  
  
  // Create symbol route
  app.post('/symbol/create/:symbol', async (req: Request, res: Response):Promise<any> => {
    const { symbol } = req.params;
    const job_id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    if(!client.isOpen) await client.connect()
    
    const responsePromise = new Promise(async (resolve) => {
      await client.subscribe("symbol_create", (message) => {
        resolve(message)
      })
    })
    await myQueue.add({event: "CreateSymbol", symbol: symbol}, {
      jobId: job_id
    })
    try {
      const response = await Promise.race([
        responsePromise, // Wait for the message
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000)) // 5 seconds timeout
      ]);
      //@ts-ignore
      const jsonResp = JSON.parse(response)
      //@ts-ignore
      if(jsonResp?.[job_id] == "ALREADY_EXISTS") {
        return res.status(400).json({
          message: `Symbol ${symbol} already exists`
        })
      }
      return res.status(200).json({
        message: `${symbol} created`
      })
    } catch (error) {
      return res.status(500).json({
        message: "Internal server error",
        data: error
      })
    }
    finally {
      await client.unsubscribe("symbol_create")
    }
  });


  // Mint tokens
app.post('/trade/mint',validateUserExists, validateSymbolExists, async(req: Request, res: Response):Promise<any> => {
    const { userId, stockSymbol, quantity } = req.body;
    if(typeof userId !== "string" || typeof stockSymbol !== "string" || typeof quantity !== "number") {
      return res.status(400).json({
        message: "Invalid request body"
      })
    }
    const job_id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    if(!client.isOpen) await client.connect()
    const responsePromise = new Promise(async(resolve) => {
      await client.subscribe("mint", (message) => {
        resolve(message)
      })
    })
    await myQueue.add({event: "Mint", quantity: quantity, stockSymbol: stockSymbol}, {
      jobId: job_id
    })
    try {
      const response = await Promise.race([
        responsePromise,
        new Promise((resolve, reject) => setTimeout(() => {
          reject(new Error("Timeout"))
        }, 5000))
      ])
      //@ts-ignore
      const jsonResp = JSON.parse(response)
      //@ts-ignore
      if(jsonResp[job_id] === "UDNE") {
        return res.status(400).json({
          message: "User does not exist"
        })
      }
      else if(jsonResp[job_id] === "SDNE") {
        return res.status(400).json({
          message: "Symbol does not exist"
        })
      }
      else if(jsonResp[job_id] === "INSUFFICIENT_BALANCE") {
        return res.status(402).json({
          message: "Insufficient balance to complete transaction"
        })
      }
      return res.status(200).json({
        message: `Minted ${quantity} 'yes' and 'no' tokens for user ${userId}, remaining balance is ${users[userId].balance}`,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Internal server error",
        data: error
      })
    }
    finally {
      await client.unsubscribe("mint")
    }
  });

app.post('/order/sell',validateUserExists, validateSymbolExists, (req: Request, res: Response):any => {
        const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;

        //validate seller stocks
        if(stockBalances[userId][stockSymbol][stockType].quantity < quantity) {
           // is the user trying to update?
          return res.status(404).json({message: `Insufficient stock balance`})
        }

        // check existing reverse orders
        const response = executeSellOrderIfReverseExists(userId, stockSymbol, stockType, quantity, price)
        
        if(response[0] == "Complete") {
          return res.status(200).json({
            message: `Sell order matched completely`,
            data: `${response[2]}`
          })
        }
        else if(response[0] == "Partial") {
          return res.status(200).json({
            message: `Sell order matched partially`,
            data: `${response[2]}`
          })
        }
        res.status(200).json({
          message: "Sell order placed"
        })
})

app.post('/order/buy',validateUserExists, validateSymbolExists, (req: Request, res: Response):any => {
   
    const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;

    if(users[userId].balance < quantity * price) {
      return "Insufficient INR balance"
    }
    // check for reverse order1
    const response = executeBuyOrderIfExists(userId, stockSymbol, stockType, quantity, price)
    if(response[0] == "Complete") {
      return res.status(200).json({
        message: "Buy order matched completely",
        data: response[2]
      })
    }
    else if(response[0] == "Partial") {
      return res.status(200).json({
        message: "Buy order matched partially, rest is placed",
        data: response[2]
      })
    }
    else {
      return res.status(200).json({
        message: "Buy order placed"
      })
    }
  
    
  });


  app.get("/balances/inr", (req, res) => {
    res.status(200).json(users)
  })

  app.get("/balances/stock", (req, res) => {
    res.status(200).json(stockBalances)
  })

  // app.get("/orderbook", (req, res) => {
  //   try {
  //     const responseBody: {
  //       [stockSymbol: string] : {
  //         [stockType: string]: {
  //           [price: number] : {
  //             total: number,
  //             orders: {
  //               [userId: string]: number 
  //             }
  //           }
  //         }
  //       }
  //     } = {}
  //     for(const stockSymbol in orders) {
  //       responseBody[stockSymbol] = {
  //         yes: {
  
  //         },
  //         no: {
  
  //         }
  //       }
  //       for(const stockType in orders[stockSymbol]) {
  //         for(const price in orders[stockSymbol][stockType]) {
  //             for(const user in orders[stockSymbol][stockType][price].orders) {
  //               if(orders[stockSymbol][stockType][price].total == 0) {
  //                 continue
  //               }
  //               responseBody[stockSymbol][stockType][price] = responseBody[stockSymbol][stockType][price] || {
  //                 total: 0,
  //                 orders: {

  //                 }
  //               }
  //               responseBody[stockSymbol][stockType][price].total = orders[stockSymbol][stockType][price].total
  //               responseBody[stockSymbol][stockType][price].orders[user] = orders[stockSymbol][stockType][price].orders[user][1] - orders[stockSymbol][stockType][price].orders[user][2]
  //             }
  //           }
  //         }
  //       }
  //     res.status(200).json(responseBody)
  //   } catch (error) {
  //     console.log(error)
  //     return
  //   }
    
    
  // })

  // app.post("/order/cancel", (req, res) => {
  //   const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;
  //   const order = orders[stockSymbol][stockType][price]
  //   orders[stockSymbol][stockType][price].total -= quantity
  //   orders[stockSymbol][stockType][price].orders[userId][1] -= quantity
  //   if(orders[stockSymbol][stockType][price].total == 0) {
  //     delete orders[stockSymbol][stockType][price]
  //   }
  //   stockBalances[userId][stockSymbol][stockType].locked -= quantity
  //   stockBalances[userId][stockSymbol][stockType].quantity += quantity

  //   res.status(200).json({
  //       message: "Sell order canceled"
  //   })
  // })

export default app

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})


