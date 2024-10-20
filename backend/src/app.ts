import express, { Request, response, Response } from "express"
import config from './config'

const app = express()

const port = config.PORT


interface User {
    balance: number;
    locked: number;
  }
  
  interface StockBalance {
    yes: { quantity: number; locked: number };
    no: { quantity: number; locked: number };
  }
  
  interface Symbol {
    yes: number,
    no: number
  }

  type OrderTradeRequest = {
    userId: string,
    stockSymbol: string,
    price: number,
    quantity: number,
    stockType: 'yes' | 'no'
}
  
  let users: Record<string, User> = {};
  let stockBalances: Record<string, Record<string, StockBalance>> = {};
  let symbols: Record<string, Symbol> = {};
  let orders: Record<string, Record<string, {[key: number]: { total: number; orders: Record<string, ["normal"|"reverse", number, number]>}}>> = {};
  
  const reset = () => {
    users = {};
    stockBalances = {};
    symbols = {};
    orders = {};
  };
  
  function checkReverseForSelling(stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number):[boolean, string] {
    try {
      for (const user in orders[stockSymbol][stockType][price].orders) {
        if(orders[stockSymbol][stockType][price].orders[user][0] == "reverse") {
          return [true, user]
        }
      }
      return [false, "none"]
    } catch (error) {
      return [false, "none"]
    }
    
    
  }

  function createSellOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, orderType: "normal" | "reverse") {
        console.log("creating reverse", orderType)
        if(orderType == "reverse") {
          orders[stockSymbol][stockType][2000 - price] = orders[stockSymbol][stockType][2000 - price] || { total: 0, orders: {} };
          orders[stockSymbol][stockType][2000 - price].total += quantity;
          const orderArray = orders[stockSymbol][stockType][2000 - price].orders[userId] = orders[stockSymbol][stockType][2000 - price].orders[userId] || []
          orderArray[0] = orderType
          orderArray[1] = quantity
          orderArray[2] = 0
          users[userId].balance -= quantity * price
          users[userId].locked += quantity * price
          return "sell order placed"
        }
        if (stockBalances[userId][stockSymbol][stockType].quantity < quantity)
        {
            return "insufficient stock balance"
        }

        const reverseExists = checkReverseForSelling(stockSymbol, stockType == "yes" ? "no" : "yes", quantity, 2000 - price)
        console.log(reverseExists)
        // check if reverse exists if yes then execute
        if(reverseExists && reverseExists[0] === true) {
          delete orders[stockSymbol][stockType == "yes" ? "no" : "yes"][2000 - price]
          users[userId].balance += quantity*price
          stockBalances[userId][stockSymbol][stockType].quantity -= quantity
          stockBalances[reverseExists[1]][stockSymbol] = stockBalances[reverseExists[1]][stockSymbol] || {
            yes: {
              quantity: 0,
              locked: 0
            },
            no: {
              quantity: 0,
              locked: 0
            }
          }
          stockBalances[reverseExists[1]][stockSymbol][stockType].quantity += quantity
          users[reverseExists[1]].locked -= quantity*price
          return `Sell order matched at price ${price}`
        }
        
        stockBalances[userId][stockSymbol][stockType].locked += quantity;
        stockBalances[userId][stockSymbol][stockType].quantity -= quantity
        orders[stockSymbol][stockType][price] = orders[stockSymbol][stockType][price] || { total: 0, orders: {} };
        orders[stockSymbol][stockType][price].total += quantity;
        const orderArray = orders[stockSymbol][stockType][price].orders[userId] = orders[stockSymbol][stockType][price].orders[userId] || []
        orderArray[0] = orderType
        orderArray[1] = quantity
        orderArray[2] = 0


        return "sell order placed"
  }

  function executeBuyOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    // match quantities for best price
        var qtyFilled = 0
        const sortedSellPrices = Object.keys(orders[stockSymbol][stockType]).map(Number).sort((a, b) => a - b)
        if(sortedSellPrices[0] <= price) {
            // buy possible quantities, create reverse order for remaining if needed
            var counter = 0
            while (counter < sortedSellPrices.length && sortedSellPrices[counter] <= price ) {
                const curPriceOrders = orders[stockSymbol][stockType][sortedSellPrices[counter]].orders
                for(const user in curPriceOrders) {
                    const curOrderQty = curPriceOrders[user][1] - curPriceOrders[user][2]
                    // exchange stocks

                    if(curOrderQty >= quantity - qtyFilled) {
                        const qtyToFill = quantity - qtyFilled
                        
                        // reduce stocks
                        stockBalances[user][stockSymbol][stockType].locked -= qtyToFill
                        // return money, take money
                        users[user].balance += qtyToFill*sortedSellPrices[counter]
                        // add stocks
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
                        stockBalances[userId][stockSymbol][stockType].quantity += qtyToFill
                        curPriceOrders[user][2] += qtyToFill
                        orders[stockSymbol][stockType][sortedSellPrices[counter]].total -= qtyToFill
                        // deduct money of buyer
                        users[userId].balance -= qtyToFill*sortedSellPrices[counter]
                        if(qtyToFill == quantity && sortedSellPrices[counter] < price) {
                          return `Buy order matched at best price ${sortedSellPrices[counter]}`
                        }
                        else if (qtyToFill == quantity && curOrderQty > quantity - qtyFilled) {
                          return `Buy order matched partially, ${curOrderQty - qtyToFill} remaining`
                        }
                        else if (qtyToFill == quantity) {
                          return `Buy order placed and trade executed`
                        }
                    }
                    else {
                      const qtyToFill = curOrderQty
                      // reduce stocks
                      stockBalances[user][stockSymbol][stockType].locked -= qtyFilled
                      // return money
                      users[user].balance += qtyToFill*sortedSellPrices[counter]
                      // add stocks
                      stockBalances[user][stockSymbol] = stockBalances[user][stockSymbol] || {
                          yes: {
                              quantity: 0,
                              locked: 0
                          },
                          no: {
                              quantity: 0,
                              locked: 0
                          }
                      }
                      stockBalances[user][stockSymbol][stockType].quantity += qtyToFill
                      curPriceOrders[user][2] += qtyToFill
                      orders[stockSymbol][stockType][sortedSellPrices[counter]].total -= qtyToFill
                      users[userId].balance -= qtyToFill*sortedSellPrices[counter]
                      continue
                    }
                    // give money to seller 
                }
                counter += 1
            }
        }
    // create a reverse order if no corresponding sell orders
    const sellOrderStatus = createSellOrder(userId, stockSymbol, stockType == "yes" ? "no": "yes", quantity - qtyFilled, price, "reverse")
    if(sellOrderStatus == "sell order placed") {
      return "Buy order placed and pending"
    }
  }


  function checkReverseOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number): [boolean | undefined, number] {
    try {
      const orderToRemove = []
      for(const price in orders[stockSymbol][stockType]) {
        console.log("prices", price)
        for(const user in orders[stockSymbol][stockType][price].orders) {
          if(user == userId && orders[stockSymbol][stockType][price].orders[user][0] == "reverse" && orders[stockSymbol][stockType][price].orders[user][1] == quantity) {
            // Order found, need to remove order
            return [true, parseInt(price)]
          }
        }
      }
      return [false, 0]
    } catch (error) {
      console.log(error)
      return [undefined, 0]
    }
  }

  // Reset route

  app.use(express.json());

  app.post('/reset', (req: Request, res: Response) => {
    reset();
    res.status(200).json({ message: 'Data reset' });
  });

  app.post('/user/create/:userId', (req: Request, res: Response): any => {
    const { userId } = req.params;
    if (users[userId]) {
      return res.status(400).json({ message: `User ${userId} already exists` });
    }
    users[userId] = { balance: 0, locked: 0 };
    stockBalances[userId] = {}
    res.status(201).json({ message: `User ${userId} created` });
  });


  // Onramp route to add balance
app.post('/onramp/inr', (req: Request, res: Response):any => {
    const { userId, amount } = req.body;
    if (!users[userId]) return res.status(404).json({ message: `User ${userId} not found` });
    
    users[userId].balance += amount
    return res.status(200).json({ message: `Onramped ${userId} with amount ${amount}` });
  });
  
  // Create symbol route
  app.post('/symbol/create/:symbol', (req: Request, res: Response):any => {
    const { symbol } = req.params;
    if (symbols[symbol]) {
      return res.status(400).json({ message: `Symbol ${symbol} already exists` });
    }
    symbols[symbol] = { yes: 0, no: 0 };
    orders[symbol] = { "yes": {}, "no": {} };
    return res.status(201).json({ message: `Symbol ${symbol} created` });
  });


  // Mint tokens
app.post('/trade/mint', (req: Request, res: Response):any => {
    const { userId, stockSymbol, quantity } = req.body;
    if (!users[userId]) return res.status(404).json({ message: `User ${userId} not found` });
    if (!symbols[stockSymbol]) return res.status(404).json({ message: `Symbol ${stockSymbol} not found` });
    if (users[userId].balance < quantity*10) return res.status(500).json({message: `Insufficient INR balance`})
    

    users[userId].balance -= quantity*10
    stockBalances[userId] = stockBalances[userId] || {};
    stockBalances[userId][stockSymbol] = stockBalances[userId][stockSymbol] || { yes: { quantity: 0, locked: 0 }, no: { quantity: 0, locked: 0 } };
    
    
    stockBalances[userId][stockSymbol].yes.quantity += quantity;
    stockBalances[userId][stockSymbol].no.quantity += quantity;
    symbols[stockSymbol].yes += quantity;
    symbols[stockSymbol].no += quantity;
  
    res.status(200).json({
      message: `Minted ${quantity} 'yes' and 'no' tokens for user ${userId}, remaining balance is ${users[userId].balance}`,
    });
  });

app.post('/order/sell', (req: Request, res: Response):any => {
        const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;
        if (!users[userId])
            {
                return res.status(404).json({ message: `User ${userId} not found` });
            } 
        if (!symbols[stockSymbol]) 
            {
                return res.status(404).json({ message: `Symbol ${stockSymbol} not found` });
            }
        const orderStatus = createSellOrder(userId, stockSymbol, stockType, quantity, price, "normal")
        if(orderStatus == "insufficient stock balance") {
            return res.status(400).json({
                message: "Insufficient stock balance"
            })
        }
        if(orderStatus == `Sell order matched at price ${price}`) {
          return res.status(200).json({message: orderStatus})
        }
        res.status(200).json({
          message: `Sell order placed for ${quantity} '${stockType}' options at price ${price}.`,
        });
})

app.post('/order/buy', (req: Request, res: Response):any => {
    try {
        const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;
        
    if (!users[userId]) return res.status(404).json({ message: `User ${userId} not found` });
    if (!symbols[stockSymbol]) return res.status(404).json({ message: `Symbol ${stockSymbol} not found` });

    // check for reverse order
    const reverseOrderStatus = checkReverseOrder(userId, stockSymbol, stockType == "yes"? "no": "yes", quantity)
    console.log(reverseOrderStatus, "checking")
    if (reverseOrderStatus[0] === true) {
      // remove reverse order
      users[userId].balance += (2000 - reverseOrderStatus[1])*quantity
      users[userId].locked -= (2000 - reverseOrderStatus[1])*quantity
      delete orders[stockSymbol][stockType == "yes" ? "no" : "yes"][reverseOrderStatus[1]].orders[userId]
      const message = executeBuyOrder(userId, stockSymbol, stockType, quantity, price)
      console.log(message, "reverse order")
      if(message !== `Buy order placed and pending`) {

        return res.status(200).json({
          message: `Buy order matched at price ${price}`
        })
      }
    }

    const totalCost = quantity * price;
    if (users[userId].balance < totalCost) {
      return res.status(400).json({ message: 'Insufficient INR balance' });
    }
    const message = executeBuyOrder(userId, stockSymbol, stockType, quantity, price)
    return res.status(200).json({message: message})
    } catch (error) {
        console.log(error)
        return res.status(500).json({
            message: "something went wrong"
        })
    }
    
  });


  app.get("/balances/inr", (req, res) => {
    res.status(200).json(users)
  })

  app.get("/balances/stock", (req, res) => {
    res.status(200).json(stockBalances)
  })

  app.get("/orderbook", (req, res) => {
    try {
      const responseBody: {
        [stockSymbol: string] : {
          [stockType: string]: {
            [price: number] : {
              total: number,
              orders: {
                [userId: string]: number 
              }
            }
          }
        }
      } = {}
      for(const stockSymbol in orders) {
        responseBody[stockSymbol] = {
          yes: {
  
          },
          no: {
  
          }
        }
        for(const stockType in orders[stockSymbol]) {
          for(const price in orders[stockSymbol][stockType]) {
              for(const user in orders[stockSymbol][stockType][price].orders) {
                if(orders[stockSymbol][stockType][price].total == 0) {
                  continue
                }
                responseBody[stockSymbol][stockType][price] = responseBody[stockSymbol][stockType][price] || {
                  total: 0,
                  orders: {

                  }
                }
                responseBody[stockSymbol][stockType][price].total = orders[stockSymbol][stockType][price].total
                responseBody[stockSymbol][stockType][price].orders[user] = orders[stockSymbol][stockType][price].orders[user][1] - orders[stockSymbol][stockType][price].orders[user][2]
              }
            }
          }
        }
      res.status(200).json(responseBody)
    } catch (error) {
      console.log(error)
      return
    }
    
    
  })

  app.post("/order/cancel", (req, res) => {
    const { userId, stockSymbol, quantity, price, stockType }: OrderTradeRequest = req.body;
    const order = orders[stockSymbol][stockType][price]
    orders[stockSymbol][stockType][price].total -= quantity
    orders[stockSymbol][stockType][price].orders[userId][1] -= quantity
    if(orders[stockSymbol][stockType][price].total == 0) {
      delete orders[stockSymbol][stockType][price]
    }
    stockBalances[userId][stockSymbol][stockType].locked -= quantity
    stockBalances[userId][stockSymbol][stockType].quantity += quantity

    res.status(200).json({
        message: "Sell order canceled"
    })
  })

export default app

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})


