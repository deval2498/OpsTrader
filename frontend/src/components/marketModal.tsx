"use client"
import { useEffect } from "react"
import Orderbook from "./orderbook"
interface MarketModalProps {
    marketTitle: string,
    marketPrice: number,
    onOpen: () => void,
    onClose: () => void,
    isOpen: boolean
}

export default function MarketModal({marketTitle, marketPrice, onOpen, onClose, isOpen} : MarketModalProps){
    useEffect(() => {
        if(isOpen) {
            onOpen()
        } else {
            onClose()
        }
    }, [isOpen])
    if(!isOpen) {
        return null
    }

    const marketOrders = [{price: "10", quantity: "15"}, {price: "7", quantity: "7"}, {price: "5", quantity: "70"}]
    return (
        <div className="fixed top-0 left-0 w-full h-full flex justify-center items-center">
            <div className="w-[400px] h-[600px] bg-black text-white border-2 border-yellow-300">
                <div className="mx-[16px]">
                    <div className="">
                        {marketTitle}
                        {marketPrice}
                    </div>
                    <div className="mt-[16px] text-white font-bold">
                        Set Price
                    </div>
                    <div className="mt-0.5 h-[100px] w-[200px] border-2 rounded-md flex flex-col gap-2">
                        <div className="mt-[10px] mx-[10px] flex flex-row justify-between justify-items-center">
                            <div>
                                Price
                            </div>
                            <div className="h-5 w-[75px] border-2 rounded-md">

                            </div>
                        </div>
                        <div className="mt-[10px] mx-[10px] flex flex-row justify-between justify-items-center">
                            <div>
                                Quantity
                            </div>
                            <div className="h-5 w-[75px] border-2 rounded-md">

                            </div>
                        </div>
                    </div>
                    <div className="mt-[16px] font-bold">
                        Orderbook
                    </div>
                    <div className="h-[100px] w-full border-2 flex flex-cols justify-between">
                        <Orderbook type={"buy"} orderValues = {marketOrders}/>
                        <Orderbook type={"sell"} orderValues = {marketOrders}/>
                    </div>
                    <div className="mt-[32px] flex flex-cols justify-between mx-[81px]">
                        <button>
                            Buy
                        </button>
                        <button>
                            Sell
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}