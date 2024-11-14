"use client"
import Card from "@/components/card";
import CreateMarketModal from "@/components/createMarketModal";
import CreateUserModal from "@/components/createUserModal";
import MarketModal from "@/components/marketModal";
import MintMoneyModal from "@/components/mintTokenModal";
import { useState } from "react";

export default function MarketsPage() {
    const cardsData = [
        { id: 1, title: 'Card 1', description: 'This is the first card.' },
        { id: 2, title: 'Card 2', description: 'This is the second card.' },
        { id: 3, title: 'Card 3', description: 'This is the third card.' },
      ];
    const [marketModal] = useState(false)
    return (
        <div className="text-white pt-[53px]">
            Available Markets
            <div className="pt-[53px] grid grid-cols-4">
            {cardsData.map((card) => (
            <Card key={card.id} cardTitle={card.title} cardDescription={card.description}/>
      ))}
            </div>
        {<MarketModal onOpen={() => console.log("onopen")} onClose={() => console.log("onclose")} marketTitle={"market title"} marketPrice={12} isOpen={marketModal}/>}
        {<CreateUserModal isOpen={false}/>}
        {<MintMoneyModal isOpen={false}/>}
        {<CreateMarketModal isOpen={false}/>}
        </div>
    )
}