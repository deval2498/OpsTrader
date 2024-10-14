import express, { Request, Response } from "express"
import config from './config'

const app = express()

const port = config.PORT

app.get('/', (req: Request, res: Response) => {
    res.send("Server is healthy")
})

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`)
})
