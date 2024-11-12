"use client"
import {useRouter} from "next/navigation"
export default function Home() {
  const router = useRouter()
  const handleRedirect = () => {
    router.push('/markets')
  }
  return (
    <div className="bg-black h-screen w-full flex flex-col text-white items-center">
      <div className="grow pt-[275px] text-6xl text-center">
        TRADE LIKE A SNIPER
        <div className="text-sm">
          Loremipsum
        </div>
        <button onClick={handleRedirect} className="text-sm">
          Trade
        </button>
      </div>
    </div>
  );
}
