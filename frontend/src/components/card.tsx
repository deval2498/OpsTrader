export default function Card(props) {
    
    return (
        <div className="h-[266px] w-[263px] rounded-lg px-[16px] pt-[25px]" style={{ backgroundColor: '#322E2E' }}>
            {props.cardTitle}
            <div className="pt-[33px]">
                Current Yes price: xxx
            </div>
            <div className="pt-[14px]">
                Current No price: xxx
            </div>
            <div className="flex flex-row justify-around pt-[69px] text-black">
                <button className="h-[24px] w-[80px] border-[1px] border-0 rounded-xl" style={{backgroundColor: "#E6EA03"}}>
                    Yes
                </button>
                <button className="h-[24px] w-[80px] border-[1px] border-0 rounded-xl" style={{backgroundColor: "#E6EA03"}}>
                    No
                </button>
            </div>
        </div>
    )
}