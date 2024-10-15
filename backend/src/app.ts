import express, { Request, Response } from "express"
import config from './config'
import { count } from "console";

const app = express()

const port = config.PORT

class NotFoundError extends Error {
    constructor(message: string) {
        super(message);  // Call the parent class (Error) constructor with the message
        this.name = "NotFoundError";  // Set the name property to "NotFoundError"
    }
}

class NotEnoughBalance extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotEnoughBalance"
    }
}

type User = {
    amount: number,
    locked: number,
    portfolio: Map<string, UserSymbol>,
    orders: Order[]
}

type UserSymbol = {
    yes: {
        amount: number,
        locked: number
    },
    no: {
        amount: number,
        locked: number
    }
}

type Symbol = {
    yes: number,
    no: number,
}

type OnrampUserRequestBody = {
    userId: string;
    amount: number;
}

type MintRequestBody = {
    userId: string,
    stockSymbol: string,
    price: number,
    quantity: number
}

type OrderTradeRequest = {
    userId: string,
    stockSymbol: string,
    price: number,
    quantity: number,
    stockType: 'yes' | 'no'
}

type Order = {
    stockSymbol: string,
    type: 'yes' | 'no',
    createdAt: Date,
    quantity: number,
    fulfilled: number,
    userId: string,
    price: number,
    orderType: 'buy' | 'sell'
}

type UserOrder = {
    [userId: string]: number; // Maps userId to order quantity
  };
  
type PriceLevel = {
    price: number; // Add the price explicitly here for sorting purposes
    total: number;
    orders: UserOrder;
  };
  
type OrderCategory = {
    yes: PriceLevel[]; // Array of PriceLevel, which will be sorted by price
    no: PriceLevel[];
  };
  
type OrderBook = {
    [stockSymbol: string]: OrderCategory;
  };

const users: { [key: string]: User } = {};

const symbols: {[key: string]: Symbol} = {};

const sellOrderBook: OrderBook = {}

const buyOrderBook: OrderBook = {}


function mintStocksToUser(quantity: number, userId: string, stockSymbol: string) {
    const user = users[userId]
    if(!user) {
        throw new NotFoundError(`${userId} not found`)
    }
    user.portfolio.set(stockSymbol, {
        yes: {
            amount: quantity,
            locked: 0
        },
        no: {
            amount: quantity,
            locked: 0
        }
    })
    return
}

function addMintedStocksToSymbol(quantity: number, stockSymbol: string) {
    const symbol = symbols[stockSymbol]
    if(!symbol) {
        throw new NotFoundError(`${stockSymbol} not found`)
    }
    symbol.yes = quantity
    symbol.no = quantity
    return
}

function lockStocksToSell(userId: string, quantity: number, stockSymbol: string, stockType: 'yes' | 'no'): boolean {
    const user = users[userId]
    const symbol = symbols[stockSymbol]
    if(!user) {
        throw new NotFoundError(`${userId} not found`)
    }
    if(!symbol) {
        throw new NotFoundError(`${stockSymbol} not found`)
    }
    const curStockHoldings = user.portfolio.get(stockSymbol)
    if(!curStockHoldings) {
        throw new NotFoundError(`${userId} does not have ${stockSymbol} in portfolio`)
    }
    const curUserBalance = curStockHoldings[stockType]
    if(!curUserBalance || curUserBalance.amount < quantity) {
        throw new NotEnoughBalance(`${userId} does not have enough ${stockSymbol} of ${stockType} in portfolio`)
    }
    const updatedUserbalance = {
        amount: curUserBalance.amount - quantity,
        locked: curUserBalance.locked + quantity
    }
    curStockHoldings[stockType] = updatedUserbalance
    return true
}

function returnMoneyToSeller(amount: number, userId: string, price: number, stockSymbol: string, stockType: "yes" | "no") {
    const amountToAdd = amount * price
    const user = users[userId]
    user.amount = user.amount + amountToAdd
    const userPortfolio = user.portfolio.get(stockSymbol)
    if(!userPortfolio) {
        throw new NotFoundError(`${userId} does not have proper portfolio`)
    }
    userPortfolio[stockType].locked = userPortfolio[stockType].locked - amount
}

function giveStocksToBuyers(stockSymbol: string, stockType: "yes" | "no", amount: number, price: number, userId: string) {
    const amountToReduce = amount*price
    const user = users[userId]
    user.locked = user.locked - amountToReduce
    user.amount = user.amount + user.locked
    const userPortfolio = user.portfolio.get(stockSymbol)
    if(!userPortfolio) {
        user.portfolio.set(stockSymbol, {
            yes: {
                amount: stockType == "yes" ? amount : 0,
                locked: 0
            },
            no: {
                amount: stockType == "no" ? amount : 0,
                locked: 0
            }
        })
        return
    }
    if(stockType == "yes") {
        userPortfolio.yes.amount = userPortfolio.yes.amount + amount
    }
    else {
        userPortfolio.no.amount = userPortfolio.no.amount + amount
    }
    return
}

function fillOrders(stockSymbol: string, stockType: 'yes' | 'no', quantity: number,price: number, orderBook: OrderBook, bookType: 'buy' | 'sell'): number{
    const orders = orderBook[stockSymbol][stockType]
    if(!orders) {
        return quantity
    }
    if(bookType == 'sell') {
        // check minimum selling price for buy order
        let minPrice = orders[0].price
        let curQty = quantity
        let counter = 0
        if(minPrice <= price) {
            while(minPrice && minPrice <= price && curQty > 0){
                console.log("We reached here", orders)
                if(curQty == orders[counter].total) {
                    // order matched return money to sellers from order book and delete order
                    for (const key in orders[counter].orders) {
                        const sellerAmount = orders[counter].orders[key]
                        returnMoneyToSeller(sellerAmount, key, minPrice, stockSymbol, stockType)
                    }
                    orders.splice(counter, 1)
                    return 0
                }
                else if(curQty < orders[counter].total) {
                    // less buy orders, no partial buy order to be created, return money to some users, update total in sellbook
                    for (const key in orders[counter].orders) {
                        const sellerAmount = orders[counter].orders[key]
                        if(curQty >= sellerAmount) {
                            returnMoneyToSeller(sellerAmount, key, minPrice, stockSymbol, stockType)
                            delete orders[counter].orders.key
                            curQty = curQty - sellerAmount
                            orders[counter].total = orders[counter].total - sellerAmount
                        }
                        else {
                            // update partial user order since curQty < sellerAmount
                            returnMoneyToSeller(curQty, key, minPrice, stockSymbol, stockType)
                            orders[counter].orders[key] = orders[counter].orders[key] - curQty
                            curQty = 0
                            orders[counter].total = orders[counter].total - curQty
                        }
                        if(curQty == 0) {
                            return curQty
                        }
                    }
                }
                else {
                    // less sell orders, create partial buy order, return money to all sellers, remove sell order
                    for (const key in orders[counter].orders) {
                        const sellerAmount = orders[counter].orders[key]
                        returnMoneyToSeller(sellerAmount, key, minPrice, stockSymbol, stockType)
                        curQty = curQty - sellerAmount
                        orders[counter].total = orders[counter].total - sellerAmount
                        if(orders[counter].total == 0) {
                            break
                        } 
                    }
                    orders.splice(counter, 1)
                    minPrice = orders[0].price
                }

            }
            return curQty
        }
        return curQty
    }
    else {
        // check maximum buying price for sell order
        let maxPrice = orders[0].price
        let curQty = quantity
        let counter = 0
        if(price <= maxPrice) {
            while(maxPrice && price <= maxPrice && curQty > 0) {
                if(curQty == orders[counter].total) {
                    // order matched return money to the 'seller' and delete order and give stocks to buyers
                    for(const key in orders[counter].orders) {
                        const buyerAmount = orders[counter].orders[key]
                        giveStocksToBuyers(stockSymbol, stockType, buyerAmount, price, key)
                        // return money to seller pending
                    }
                    return 0
                }
                else if(curQty < orders[counter].total) {
                    // less sell orders, no partial sell order to be created, give stocks to some users
                    for (const key in orders[counter].orders) {
                        const buyerAmount = orders[counter].orders[key]
                        if(curQty >= buyerAmount) {
                            giveStocksToBuyers(stockSymbol, stockType, buyerAmount, price, key)
                            // delete orders[counter].orders.key  not a good idea to change obj while iterating
                            curQty = curQty - buyerAmount
                            orders[counter].total = orders[counter].total - buyerAmount
                        }
                        else {
                            // update partial user buy order since curQty < buyeramount
                            giveStocksToBuyers(stockSymbol, stockType, curQty, price, key)
                            orders[counter].orders[key] = orders[counter].orders[key] - curQty
                            orders[counter].total = orders[counter].total - curQty
                            curQty = 0
                        }
                        if(curQty == 0) {
                            return curQty
                        }
                    }
                }
                else {
                    // less buy orders, create partial sell order, give stocks to all buyers, remove buy order
                    for (const key in orders[counter].orders) {
                        const buyerAmount = orders[counter].orders[key]
                        giveStocksToBuyers(stockSymbol, stockType, buyerAmount, price, key)
                        curQty = curQty - buyerAmount
                        orders[counter].total = orders[counter].total - buyerAmount
                        
                    }
                    orders.splice(0, 1)
                }
                maxPrice = orders[0].price
            }
            return curQty
        }
        return curQty

    }

}

function swapExecution(userId: string, stockSymbol: string, quantity: number, price: number, stockType: 'yes' | 'no', action: "buy" | "sell"): number {
    // check sell orders
    console.log("Initiating swap if exists")
    if(action == "buy") {
        if(sellOrderBook[stockSymbol]) {
            const pendingQuantity = fillOrders(stockSymbol, stockType, quantity, price, sellOrderBook, "sell")
            return pendingQuantity
        }
        return quantity
        // create buy order and lock the amount
    }
    // check buy orders
    else {
        if(buyOrderBook[stockSymbol]) {
            const pendingQuantity = fillOrders(stockSymbol, stockType, quantity, price, buyOrderBook, "buy")
            return pendingQuantity
        }
        return quantity
        // create sell order and lock the stock
    }
}

function createSellOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    const user = users[userId]
    if(!user) {
        throw new NotFoundError(`${userId} not found`)
    }
    const sellOrder = sellOrderBook[stockSymbol]
    if(!sellOrder) {
        const priceOrder: PriceLevel = {
            price: price,
            total: quantity,
            orders: {
                [userId] : quantity
            }
        }
        sellOrderBook[stockSymbol] = {
            yes: stockType == 'yes' ? [priceOrder]: [],
            no: stockType == "no" ? [priceOrder]: []
        }
    }
    else {
        const sellersArray = sellOrder[stockType]
        const findPrice = sellersArray.findIndex(item => item.price == price)
        if(findPrice) {
            sellersArray[findPrice].orders[userId] = quantity
            sellersArray[findPrice].total += quantity 
        }
        sellersArray.push({
            price: price,
            total: quantity,
            orders: {
                [userId]: quantity
            }
        })
        // sort in ascending order
        sellersArray.sort((a,b) => a.price - b.price)
    }
}

function createBuyOrder(userId: string, stockSymbol: string, stockType: "yes" | "no", quantity: number, price: number) {
    // not locking amount here for user
    const user = users[userId]
    if(!user) {
        throw new NotFoundError(`${userId} not found`)
    }
    const buyOrder = buyOrderBook[stockSymbol]
    if(!buyOrder) {
        const priceOrder: PriceLevel = {
            price: price,
            total: quantity,
            orders: {
                userId: quantity
            }
        }
        buyOrderBook[stockSymbol] = {
            yes: stockType == 'yes' ? [priceOrder]: [],
            no: stockType == "no" ? [priceOrder]: []
        }
    }
    else {
        const buyersArray = buyOrder[stockType]
        const findPrice = buyersArray.findIndex((item) => item.price == price)
        if(findPrice) {
            buyersArray[findPrice].orders[userId] = quantity
            buyersArray[findPrice].total = buyersArray[findPrice].total + quantity
        }
        else {
            buyersArray.push(
                {
                    price: price,
                    total: quantity,
                    orders: {
                        userId: quantity
                    }
                }
            )
            // sort in descending order
            buyersArray.sort((a,b) => b.price - a.price)
        }
    }

}

function initiateSellOrder(userId: string, stockSymbol: string, quantity:number , price:number, stockType: 'yes' | 'no'): {orderPlaced: number, orderExecuted: number} {
    // Execute buy orders if buy price is more than sell and execute at sellers price, locking should be done here?
    const pendingQuantity = swapExecution(userId, stockSymbol, quantity, price, stockType, 'sell')
    createSellOrder(userId, stockSymbol, stockType, pendingQuantity, price)
    return {orderPlaced: pendingQuantity, orderExecuted: quantity - pendingQuantity}
}

function initiateBuyOrder(userId: string, stockSymbol: string, quantity:number , price:number, stockType: 'yes' | 'no'): {orderPlaced: number, orderExecuted: number} {
    // Execute buy orders if buy price is more than sell and execute at sellers price, locking should be done here?
    const pendingQuantity = swapExecution(userId, stockSymbol, quantity, price, stockType, 'buy')
    createBuyOrder(userId, stockSymbol, stockType, pendingQuantity, price)
    return {orderPlaced: pendingQuantity, orderExecuted: quantity - pendingQuantity}
}

app.use(express.json())

app.get('/', (req: Request, res: Response) => {
    res.send("Server is healthy")
})

app.post('/user/create/:id', (req: Request, res: Response) => {
    try {
        const userId = req.params.id
        users[userId] = {
            amount: 0,
            locked: 0,
            portfolio: new Map(),
            orders: new Array()
        }
        res.status(201).json({
            message: `User ${userId} created`
        })
    } catch (error) {
        res.status(500).json({
            error: true,
            message: "Internal Server Error"
        })
    }
})

app.post('/onramp/inr', (req: Request, res: Response) => {
    try {
        const {userId, amount}: OnrampUserRequestBody = req.body
        if(!(userId in users)) {
            throw new NotFoundError(`${userId} not found`)
        }
        users[userId]["amount"] =  amount
        res.status(200).json({
            message: `Onramped ${userId} with amount ${amount}`
        }) 
    } catch (error) {
        if(error instanceof NotFoundError) {
            res.status(404).json({
                message: error.message
            })
        }
        else {
            res.status(500).json({
                error: true,
                message: "Internal Server Error"
            })
        }
    }

})

app.post('/symbol/create/:id', (req: Request, res: Response) => {
    try {
        const name = req.params.id
        symbols[name] = {
            yes: 0,
            no: 0
        }
        res.status(201).json({
            message: `Symbol ${name} created`
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Internal Server Error"
        })
    }
})

app.post('/trade/mint', (req: Request, res: Response) => {
    try {
        const {userId, stockSymbol, price, quantity}: MintRequestBody = req.body
        if(!(userId in users)) {
            throw new NotFoundError(`${userId} not found`)
        }
        if(!(stockSymbol in symbols)) {
            throw new NotFoundError(`${stockSymbol} not found`)
        }
        const curUserBalance = users[userId].amount
        const remainder = curUserBalance - price*quantity*2
        if(remainder < 0) {
            throw new NotEnoughBalance(`${userId} needs ${Math.abs(remainder)} more`)
        }
        mintStocksToUser(quantity, userId, stockSymbol)
        users[userId].amount -= price*quantity*2
        addMintedStocksToSymbol(quantity, stockSymbol)
        res.status(200).json({
            message: `Minted ${quantity} 'yes' and 'no' tokens for user ${userId}, remaining balance is ${remainder}`
        })
    } catch (error) {
        console.log(error)
        if(error instanceof NotFoundError || error instanceof NotEnoughBalance){
            res.status(404).json(
                {message: error.message}
            )
        }
        else {
            res.status(500).json({
                message: "Internal Server Error"
            })
        }
    }
})
// type Order = {
//     stockSymbol: string,
//     type: 'yes' | 'no',
//     createdAt: Date,
//     quantity: number,
//     fulfilled: number,
//     userId: string,
// }
app.post('/order/sell', (req: Request, res:Response) => {
    try {
        const {userId, stockSymbol, quantity, price, stockType}: OrderTradeRequest = req.body
        const user = users[userId]
        if(!(userId in users)) {
            throw new NotFoundError(`${userId} not found`)
        }
        if(!(stockSymbol in symbols)) {
            throw new NotFoundError(`${stockSymbol} not found`)
        }
        const userStockBalance = user.portfolio.get(stockSymbol)
        if(!userStockBalance) {
            throw new NotFoundError(`${stockSymbol} not found in ${userId} portfolio`)
        }
        const stocksLocked = lockStocksToSell(userId, quantity, stockSymbol, stockType)
        if(stocksLocked) {
            const {orderPlaced, orderExecuted} = initiateSellOrder(userId, stockSymbol, quantity, price, stockType) // first check if there are any buyer then add remaining to order book
            userStockBalance[stockType].locked -= orderExecuted
            if(orderPlaced == 0) {
                res.status(200).json({
                    message: `Sell order placed and trade executed`
                })
            }
            else if(orderPlaced == quantity) {
                res.status(200).json({
                    message: `Sell order placed for ${orderPlaced} '${stockType}' options at price ${price}.`
                })
            }
        }
        else {
            res.status(404).json({
                message: `Unable to place sell order`
            })
        }
        
    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: "Internal Server Error",
        })
    }
})

app.post('/order/buy', (req: Request, res: Response) => {
    const {userId, stockSymbol, quantity, price, stockType}: OrderTradeRequest = req.body
    const user = users[userId]
    if(!(userId in users)) {
        throw new NotFoundError(`${userId} not found`)
    }
    if(!(stockSymbol in symbols)) {
        throw new NotFoundError(`${stockSymbol} not found`)
    }
    const remainder = user.amount - quantity*price
    if(remainder < 0) {
        throw new NotEnoughBalance(`${userId} needs ${Math.abs(remainder)} more to place this order`)
    }
    user.amount -= quantity*price
    user.locked += quantity*price
    const order: Order = {
        stockSymbol: stockSymbol,
        type: stockType,
        createdAt: new Date(),
        quantity: quantity,
        price: price,
        fulfilled: 0,
        userId: userId,
        orderType: 'buy'
    }
    const {orderPlaced, orderExecuted} = initiateBuyOrder(userId, stockSymbol, quantity, price, stockType)
    user.locked -= orderExecuted*price
    if(orderPlaced == 0) {
        res.status(200).json({
            message: `Buy order placed and trade executed`
        })
    }

    

})

app.get('/balances/inr', (req: Request, res: Response) => {
    const responseBody: {[key: string]: {balance: number, locked: number}} = {}
    for(const key in users) {
        responseBody[key] = {
            balance: users[key].amount,
            locked: users[key].locked
        }
    }
    console.log(responseBody, "For my test")
    res.status(200).json(responseBody)
})

export default app

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})


