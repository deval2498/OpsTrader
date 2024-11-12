export default function Navbar() {
    return (
        <div className="w-full py-2 pt-5">
            <div className="text-white flex justify-between">
                <button>
                    Opstrader
                </button>
                <div>
                <button className="mr-5">
                    Home
                </button>
                <button className="mr-5">
                    About
                </button>
                <button className="">
                    Login
                </button>
                </div>
            </div>
        </div>
    )
}