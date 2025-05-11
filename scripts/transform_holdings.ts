import * as fs from "fs/promises";
import * as path from "path";

interface InputHolding {
  "Stock Ticker": string;
  "Security Name": string;
  CUSIP: string;
  Shares: string;
  Price: string;
  "Mkt Value": string;
  Weightings: string;
  actual_weighting: number;
}

interface OutputHolding {
  name: string;
  weight: number | null;
  market_value: number | null;
  actual_weight: number | null;
  price: number | null;
}

interface OutputData {
  etfSymbol: string;
  lastUpdated: string;
  holdings: {
    [ticker: string]: OutputHolding;
  };
}

function parseFloatSafe(value: string): number | null {
  const cleanedValue = value.replace(/,/g, "");
  const num = parseFloat(cleanedValue);
  return isNaN(num) ? null : num;
}

async function transformHoldings() {
  const inputFile = path.join(__dirname, "data", "ebi_holdings.json");
  const outputFile = path.join(
    __dirname,
    "data",
    "ebi_holdings_transformed.json"
  );

  try {
    console.log(`Reading input file: ${inputFile}`);
    const fileContent = await fs.readFile(inputFile, "utf-8");
    const inputData: InputHolding[] = JSON.parse(fileContent);

    console.log(
      `Successfully read ${inputData.length} records from input file.`
    );

    const outputData: OutputData = {
      etfSymbol: "EBI",
      lastUpdated: new Date().toISOString(),
      holdings: {},
    };

    for (const item of inputData) {
      const ticker = item["Stock Ticker"];
      if (!ticker) {
        console.warn('Skipping item due to missing "Stock Ticker":', item);
        continue;
      }

      // Special handling for "Cash&Other" if necessary,
      // for now, it's processed like any other ticker.
      // If "Cash&Other" has a different structure, more specific logic might be needed here.

      outputData.holdings[ticker] = {
        name: item["Security Name"],
        weight: parseFloatSafe(item["Weightings"]),
        market_value: parseFloatSafe(item["Mkt Value"]),
        actual_weight:
          typeof item["actual_weighting"] === "number"
            ? item["actual_weighting"]
            : null,
        price: parseFloatSafe(item["Price"]),
      };
    }

    console.log(`Writing transformed data to: ${outputFile}`);
    await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2));
    console.log("Transformation complete. Output written to", outputFile);
  } catch (error) {
    console.error("Error during transformation:", error);
  }
}

transformHoldings();
