import request from "supertest";
import app from "../app"; // Make sure the path points to your TypeScript app file

describe("E-to-E-1", () => {
  beforeAll(async () => {
    await request(app).post("/reset"); // Resets the data values
  });

  it("this test just checks the response messages and status", async () => {
    // Step 1: Create a new user (User5)
    let response = await request(app).post("/user/create/user5");
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("User user5 created");

    // Step 2: Add balance to user5
    response = await request(app).post("/onramp/inr").send({
      userId: "user5",
      amount: 50000,
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Onramped user5 with amount 50000");

    // Step 3: Create a new symbol
    response = await request(app).post(
      "/symbol/create/AAPL_USD_25_Oct_2024_14_00",
    );
    expect(response.status).toBe(201);
    expect(response.body.message).toBe(
      "Symbol AAPL_USD_25_Oct_2024_14_00 created",
    );

    // Step 4: Mint tokens for User5
    response = await request(app).post("/trade/mint").send({
      userId: "user5",
      stockSymbol: "AAPL_USD_25_Oct_2024_14_00",
      quantity: 25,
      price: 1000,
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Minted 25 'yes' and 'no' tokens for user user5, remaining balance is 0",
    );

    // Step 5: User5 sells 10 'no' tokens
    response = await request(app).post("/order/sell").send({
      userId: "user5",
      stockSymbol: "AAPL_USD_25_Oct_2024_14_00",
      quantity: 10,
      price: 1000,
      stockType: "no",
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Sell order placed for 10 'no' options at price 1000.",
    );

    // Step 6: Create User6 and buy the 'no' tokens from the order book
    response = await request(app).post("/user/create/user6");
    expect(response.status).toBe(201);
    expect(response.body.message).toBe("User user6 created");

    // Add balance to user6
    response = await request(app).post("/onramp/inr").send({
      userId: "user6",
      amount: 20000,
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Onramped user6 with amount 20000");

    response = await request(app).post("/order/buy").send({
      userId: "user6",
      stockSymbol: "AAPL_USD_25_Oct_2024_14_00",
      quantity: 10,
      price: 1000,
      stockType: "no",
    });
    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Buy order placed and trade executed");

    // Fetch balances after the trade
    response = await request(app).get("/balances/inr");
    expect(response.status).toBe(200);
    expect(response.body["user6"]).toEqual({
      balance: 10000, // 20000 - (10 * 1000)
      locked: 0,
    });
    expect(response.body["user5"]).toEqual({
      balance: 10000,
      locked: 0,
    });
  });
});
