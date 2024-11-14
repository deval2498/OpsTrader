import { useEffect } from "react"

export default function CreateMarketModal({isOpen}) {
    useEffect(() => {
        
    }, [isOpen])
    if(!isOpen) {
        return null
    }
    return (
        <div className="fixed top-0 left-0 w-full h-full flex justify-center items-center">
            <div className="h-[200px] w-[350px] bg-black border-2 flex flex-col gap-2 rounded-md">
                <div className="mt-6 mx-4 flex justify-center">
                Create Market
                </div>
                <div className="flex justify-center">
                    <input name="createUser" className="mx-4 rounded-md p-2" style={{backgroundColor: "#322E2E"}} placeholder="Enter name..."/>
                </div>
                <div className="flex justify-center mx-4">
                <button className="mt-4 h-[30px] w-[85px] rounded-md text-black flex items-center justify-center" style={{backgroundColor: "#E6EA03"}}>
                    Create Market
                </button>
                </div>
            </div>
        </div>
    )
}