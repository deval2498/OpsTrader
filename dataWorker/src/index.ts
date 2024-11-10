import Queue from 'bull';
import config from './config';
import fs from "fs"
import path from "path"
import {createClient} from "redis"
import { Job } from 'bull';

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

type Users = Record<string, User>
type StockBalances = Record<string, Record<string, StockBalance>>
type Orders = Record<string, Record<string, { [key: number]: { total: number; orders: Record<string, { userId: string, quantity: number, filled: number, type: OrderType }> } }>>



type Publishable = string | number | boolean | object;

const logFilePath = path.join(__dirname, "../logFile.json")
console.log(logFilePath, "LOg file path set")


const client = createClient();


function createTupleKey(userId: string, type: OrderType): string {
  return `${userId}_${type}`; // Concatenate string and order type
}

const initializeLogFile = () => {
  const defaultData = {
    users: {},
    stockBalances: {},
    orders: {}
  }
  try {
    const data = fs.existsSync(logFilePath) ? fs.readFileSync(logFilePath, 'utf-8') : ''
    if(!data) {
      fs.writeFileSync(logFilePath, JSON.stringify(defaultData, null, 2), 'utf-8')
      console.log("Log file initialized with default data")
    }
    else {
      console.log("Log file already contains data")
    }
  } catch (error) {
    console.log("Error initializing json file")
  }
}
initializeLogFile()





async function publishMessage(channel: string, message: Publishable): Promise<void> {
  // Ensure the message is a string
  const messageString: string =
    typeof message === 'object' ? JSON.stringify(message) : String(message);

  try {
    if (!client.isOpen) await client.connect();
    const result = await client.publish(channel, messageString);
    console.log(`Message published to channel ${channel} with ${result} subscribers.`);
  } catch (error) {
    console.error('Error publishing message:', error);
  } finally {
    await client.disconnect()
  }
}

const readLogFile = () => {
  const data = fs.readFileSync(logFilePath, 'utf8');
  return JSON.parse(data);
};

const updateLogFile = (objKeys: 'users' | 'stockBalances' | 'orders', newObj: object) => {
  try {
    console.log("reached here")
    const data = fs.readFileSync(logFilePath, 'utf-8')
    const jsonData = JSON.parse(data)
    jsonData[objKeys] = newObj
    fs.writeFileSync(logFilePath, JSON.stringify(jsonData, null, 2), 'utf-8')
    console.log("Updated log file with new object", newObj)
  } catch (error) {
    console.log("Failed to update data", newObj)
  }
}

function checkReverseOrder(stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders): {[price: number]:{[userId: string]: number}} {
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

function matchReverseOrder(orderKey: string , seller: string,  stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders): [string, number] {
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

function createSellOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
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
  orders[stockSymbol][stockType][price].orders[createTupleKey(userId, "normal")] = {
    userId: userId,
    quantity: quantity,
    filled: 0,
    type: "normal"
  }
  return
}

function executeSellOrderIfReverseExists(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
  // get list of reverse orders that exist
  const reverseOrderList = checkReverseOrder(stockSymbol, stockType, quantity, price, users, stockBalances, orders)
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
          const response = matchReverseOrder(user, userId, stockSymbol, stockType, quantity - qtySold, Number(price), users, stockBalances, orders)
          buyerListAndPrices[response[0]] = buyerListAndPrices[response[0]] || 0
          buyerListAndPrices[response[0]] += buyerListAndPrices[response[1]]
          return ["Complete",0, buyerListAndPrices]
        }
        else {
          let curOrderQty = reverseOrderList[price][user]
          const response = matchReverseOrder(user, userId, stockSymbol, stockType, curOrderQty, Number(price), users, stockBalances, orders)
          buyerListAndPrices[response[0]] = buyerListAndPrices[response[0]] || 0
          buyerListAndPrices[response[0]] += buyerListAndPrices[response[1]]
          qtySold += curOrderQty
        }
        
      }
    }
  }
  if(qtySold == 0) {
    createSellOrder(userId, stockSymbol, stockType, quantity, price, users, stockBalances, orders)
    return ["Incomplete", quantity, {}]
  }
  createSellOrder(userId, stockSymbol, stockType, quantity - qtySold, price, users, stockBalances, orders)
  return ["Partial", quantity - qtySold, buyerListAndPrices]
}

function checkSellOrders(stockSymbol: string, stockType: "yes" | "no", price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
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

function mintToBuyer(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
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

function matchNormalOrder(buyer: string , orderKey: string,  stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
  const orderRecord = orders[stockSymbol][stockType][price]
  const order = orders[stockSymbol][stockType][price].orders

  // change order quantities
  order[orderKey].filled += quantity
  orderRecord.total -= quantity
  if(order[orderKey].type == "reverse") {
    // mint to the userId
    mintToBuyer(order[orderKey].userId, stockSymbol, stockType == "yes" ? "no": "yes", quantity, 1000 - price, users, stockBalances, orders)
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

function createReverseOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
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
  orders[stockSymbol][stockType][price].orders[createTupleKey(userId, "reverse")] = {
    userId: userId,
    quantity: quantity,
    filled: 0,
    type: "reverse"
  }
  return
}

function executeBuyOrderIfExists(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number, users: Users, stockBalances: StockBalances, orders: Orders) {
  const sellOrderList = checkSellOrders(stockSymbol, stockType, price, users, stockBalances, orders)
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
          matchNormalOrder(userId, user, stockSymbol, stockType, quantity - qtyFilled, parseInt(orderPrice), users, stockBalances, orders)
          qtyFilled = quantity
          filledOrderList[user] = filledOrderList[user] || 0
          filledOrderList[user] = quantity
          
            return ["Complete", 0, filledOrderList]
          } 
          // filling partial
          matchNormalOrder(userId, user, stockSymbol, stockType, sellOrderList[orderPrice][user], parseInt(orderPrice), users, stockBalances, orders)
          qtyFilled += sellOrderList[orderPrice][user]
          filledOrderList[user] = filledOrderList[user] || 0
          filledOrderList[user] += sellOrderList[orderPrice][user]
        }
      }
    }
    if(qtyFilled == 0) {
      createReverseOrder(userId, stockSymbol, stockType == "yes" ? "no":"yes", quantity, 1000 - price, users, stockBalances, orders)
      users[userId].balance -= quantity * price
      users[userId].locked += quantity * price
      return ["Incomplete", quantity, filledOrderList]
    }
    else{
      createReverseOrder(userId, stockSymbol, stockType == "yes" ? "no":"yes", quantity - qtyFilled, 1000 - price, users, stockBalances, orders)
      users[userId].balance -= ((quantity - qtyFilled) * price)
      users[userId].locked += ((quantity - qtyFilled) * price)
      return ["Partial", quantity - qtyFilled, filledOrderList]
    }
  }

const queue1 = new Queue('queue_1', {
    redis: {
        host: config.REDIS_HOST,
        port: Number(config.REDIS_PORT),
        password: config.REDIS_PASSWORD.length > 0 ? config.REDIS_PASSWORD : undefined
      },
});

queue1.on("error", async (err) => {
  console.error("Queue encountered an error:", err.message, config.REDIS_PORT);
  try {
    await queue1.close(); // Close current connection
    await queue1.isReady(); // Wait for reconnection
  } catch (reconnectError) {
    console.error("Error reconnecting to queue:", reconnectError);
  }
});

const queue2 = new Queue('queue_2', {
    redis: {
        host: config.REDIS_HOST,
        port: Number(config.REDIS_PORT),
        password: config.REDIS_PASSWORD === "undefined" ? undefined : config.REDIS_PASSWORD
      }
})

queue1.process(async (job) => {
  // Your processing logic here
  const data = readLogFile()
  const users: Record<string, User> = data.users
  const stockBalances: Record<string, Record<string, StockBalance>> = data.stockBalances
  const orders: Record<string, Record<string, { [key: number]: { total: number; orders: Record<string, { userId: string, quantity: number, filled: number, type: OrderType }> } }>> = data.orders
  switch(job.data.event) {
    case "CreateUser":
      if(!users[job.data.userId]) {
        users[job.data.userId] = {
          balance: 0,
          locked: 0
        }
        stockBalances[job.data.userId] = {}
        updateLogFile("users", users)
        updateLogFile("stockBalances", stockBalances)
        publishMessage("create_user_resp", {[job.id]: 'SUCCESS'})
      }
      else {
        publishMessage("create_user_resp", {[job.id]: 'ALREADY_EXISTS'})
      }
      break
    case "OnrampINR": 
      if(!users[job.data.userId]) {
        publishMessage("onramp_resp", {[job.id]: 'UDNE'})
      }
      users[job.data.userId].balance += job.data.amount
      updateLogFile("users", users)
      publishMessage("onramp_resp", {[job.id]: "SUCCESS"})
      break
    case "CreateSymbol":
      if(!orders[job.data.symbol]) {
        orders[job.data.symbol] = {
          yes: {},
          no: {}
        }
        updateLogFile("orders", orders)
        publishMessage("symbol_create", {[job.id]: "SUCCESS"})
      }
      publishMessage("symbol_create", {[job.id]: "ALREADY_EXISTS"})
      break
    case "Mint":
      if(users[job.data.userId]) {
        if(orders[job.data.stockSymbol]) {
          if(users[job.data.userId].balance >= job.data.quantity*10) {
            users[job.data.userId].balance -= job.data.quantity*10
            stockBalances[job.data.userId][job.data.stockSymbol] = stockBalances[job.data.userId][job.data.stockSymbol] || {
              yes: {
                quantity: 0,
                locked: 0
              },
              no: {
                quantity: 0,
                locked: 0
              }
            }
            stockBalances[job.data.userId][job.data.stockSymbol].yes.quantity += job.data.quantity
            stockBalances[job.data.userId][job.data.stockSymbol].no.quantity += job.data.quantity
            updateLogFile("stockBalances", stockBalances)
            updateLogFile("users", users)
            publishMessage("mint", {[job.id]: "SUCCESS"})
          }
          publishMessage("mint", {[job.id] : "INSUFFICIENT_BALANCE"})
        }
        publishMessage("mint", {[job.id]: "SDNE"})
      }
      publishMessage("mint", {[job.id]: "UDNE"})
      break
      case "Sell":
        if(users[job.data.userId]){
          if(orders[job.data.stockSymbol]) {
            //@ts-ignore
            if(stockBalances[job.data.userId][job.data.stockSymbol][job.data.stockType].quantity >= job.data.quantity) {
              const response = executeSellOrderIfReverseExists(job.data.userId, job.data.stockSymbol, job.data.stockType, job.data.quantity, job.data.price, users, stockBalances, orders)
              updateLogFile("users", users)
              updateLogFile("stockBalances", stockBalances)
              updateLogFile("orders", orders)
              if(response[0] == "Complete") {
                publishMessage("sell", {[job.id]: {
                  message: "SELL_COMPLETE",
                  data: response[2]
                }})
              }
              else if(response[0] == "Partial") {
                publishMessage("sell", {[job.id]: {
                  message: "SELL_PARTIAL",
                  data: response[2]
                }})
              }
              else {
                publishMessage("sell", {[job.id]: {
                  message: "SELL_PLACED",
                  data: response[2]
                }})
              }
              break
            }
            publishMessage("sell", {[job.id]: "INSUFFICIENT_STOCKS"})
            break
          }
          publishMessage("sell", {[job.id]: "SDNE"})
          break
        }
        publishMessage("sell", {[job.id]: "UDNE"})
        break
      case "Buy":
        if(users[job.data.userId]){
          if(orders[job.data.stockSymbol]) {
            if(!(users[job.data.userId].balance >= job.data.price * job.data.quantity)) {
              const response = executeBuyOrderIfExists(job.data.userId, job.data.stockSymbol, job.data.stockType, job.data.quantity, job.data.price, users, stockBalances, orders)
              updateLogFile("users", users)
              updateLogFile("stockBalances", stockBalances)
              updateLogFile("orders", orders)
              if(response[0] == "Complete") {
                publishMessage("buy", {[job.id]: {
                  message: "BUY_COMPLETE",
                  data: response[2]
                }})
              }
              else if(response[0] == "Partial") {
                publishMessage("sell", {[job.id]: {
                  message: "BUY_PARTIAL",
                  data: response[2]
                }})
              }
              else {
                publishMessage("sell", {[job.id]: {
                  message: "BUY_PLACED",
                  data: response[2]
                }})
              }
              break
            }
            publishMessage("sell", {[job.id]: "INSUFFICIENT_BALANCE"})
            break
          }
          publishMessage("sell", {[job.id]: "SDNE"})
          break
        }
        publishMessage("sell", {[job.id]: "UDNE"})
        break
      default:
        console.error(`Unhandled job event: ${job.data.event}`);
  }
});

