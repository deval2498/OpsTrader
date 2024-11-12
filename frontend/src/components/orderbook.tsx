export default function Orderbook ({type, orderValues}) {
    return (
        <div className="w-[45%] flex flex-col">
            <div className="flex flex-row justify-between text-sm mx-1">
                <div>Price</div>
                <div>Qty</div>
            </div>
            {orderValues.map((x) => (
                <div key={x.price} className="w-full h-3 flex justify-between text-sm">
                    <div className="mx-2">
                        {x.price}
                    </div>
                    <div className="mx-2">
                        {x.quantity}
                    </div>
                </div>
            ))}
            
        </div>
    )
}