import * as fs from "fs";

interface ParsedRecord {
  "Stock Ticker": string;
  "Security Name": string;
  CUSIP: string;
  Shares: string;
  Price: string;
  "Mkt Value": string;
  Weightings: string;
}

function parseHoldingsTS(filePath: string): ParsedRecord[] {
  const parsedRecords: ParsedRecord[] = [];
  let fileLines: string[];

  try {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    fileLines = fileContent.split("\n");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(`Error: File not found at ${filePath}`);
    } else {
      console.error(`Error reading file: ${error.message}`);
    }
    return [];
  }

  // Skip the first two lines (title and header)
  if (fileLines.length < 3) {
    console.warn("Warning: File has less than 3 lines. No data to parse.");
    return [];
  }

  const dataLines = fileLines.slice(2);

  dataLines.forEach((lineContent, index) => {
    // fileLines was 0-indexed, slice(2) makes dataLines 0-indexed starting from original line 2.
    // Original file lines are 1-indexed, data starts on original line 3.
    // So, current line number in original file = (index in dataLines) + 3.
    const lineNumber = index + 3;
    const cleanedLine = lineContent.trim();

    if (!cleanedLine) {
      return; // Skip empty lines (equivalent to 'continue' in a loop)
    }

    const parts = cleanedLine.split(/\s+/); // Split by one or more spaces

    if (parts.length < 6) {
      console.warn(
        `Warning: Line ${lineNumber} (content: '''${cleanedLine}''') has fewer than 6 parts, skipping.`
      );
      return;
    }

    try {
      const weightingsStr = parts[parts.length - 1];
      const mktValueStr = parts[parts.length - 2];
      const priceStr = parts[parts.length - 3];
      const sharesStr = parts[parts.length - 4];
      const cusip = parts[parts.length - 5];
      const stockTicker = parts[0];

      // Security Name is everything between the stock_ticker and cusip
      const securityNameParts = parts.slice(1, parts.length - 5);
      const securityName = securityNameParts.join(" ");

      // Validate numeric fields by attempting conversion
      // Throws an error if any conversion results in NaN
      if (
        isNaN(parseFloat(sharesStr.replace(/,/g, ""))) ||
        isNaN(parseFloat(priceStr.replace(/,/g, ""))) ||
        isNaN(parseFloat(mktValueStr.replace(/,/g, ""))) ||
        isNaN(parseFloat(weightingsStr.replace(/,/g, "")))
      ) {
        // This specific error message will be caught below
        throw new Error("Non-numeric data in expected numeric columns");
      }

      const record: ParsedRecord = {
        "Stock Ticker": stockTicker,
        "Security Name": securityName,
        CUSIP: cusip,
        Shares: sharesStr,
        Price: priceStr,
        "Mkt Value": mktValueStr,
        Weightings: weightingsStr,
      };
      parsedRecords.push(record);
    } catch (error: any) {
      if (error.message === "Non-numeric data in expected numeric columns") {
        console.warn(
          `Warning: Line ${lineNumber} (content: '''${cleanedLine}''') contains non-numeric data in expected numeric columns, skipping.`
        );
      } else if (error instanceof RangeError) {
        // Specifically for issues like slice if parts.length was misjudged (though <6 check should prevent)
        console.warn(
          `Warning: Line ${lineNumber} (content: '''${cleanedLine}''') is malformed (RangeError), skipping.`
        );
      } else {
        console.warn(
          `Warning: An unexpected error occurred on line ${lineNumber} (content: '''${cleanedLine}'''), skipping. Error: ${error.message}`
        );
      }
    }
  });

  return parsedRecords;
}

function main() {
  const fileToParse = "data/holdings.txt"; // Relative to where the script is run
  const results = parseHoldingsTS(fileToParse);

  if (results.length > 0) {
    console.log(
      `\nSuccessfully parsed ${results.length} records from '''${fileToParse}'''.`
    );

    console.log("\n--- First 5 Parsed Records ---");
    results.slice(0, 5).forEach((record, i) => {
      console.log(`Record ${i + 1}:`, record);
    });

    if (results.length > 5) {
      console.log("\n--- Last 5 Parsed Records ---");
      results.slice(-5).forEach((record, i) => {
        // For the last 5, 'i' will be 0-4. We want to show original record number from the parsed set.
        console.log(`Record ${results.length - 5 + i + 1}:`, record);
      });
    }

    // Write to JSON file
    const outputJsonFile = "data/parsed_holdings.json";
    try {
      const jsonContent = JSON.stringify(results, null, 2); // null, 2 for pretty printing
      fs.writeFileSync(outputJsonFile, jsonContent, "utf-8");
      console.log(
        `\nResults also written to JSON file: '''${outputJsonFile}'''.`
      );
    } catch (e: any) {
      console.error(
        `\nError writing to JSON file ${outputJsonFile}: ${e.message}`
      );
    }

    // Optional: Write to CSV for more thorough validation by the user
    // const outputCsvFile = 'parsed_holdings_ts.csv';
    // if (results.length > 0) {
    //     const keys = Object.keys(results[0]) as (keyof ParsedRecord)[];
    //     // Simple CSV header
    //     let csvContent = keys.join(',') + '\n';
    //     // Add rows, ensuring values are quoted and quotes within values are escaped
    //     results.forEach(record => {
    //         csvContent += keys.map(key => `"${String(record[key]).replace(/"/g, '""')}"`).join(',') + '\n';
    //     });
    //     try {
    //         fs.writeFileSync(outputCsvFile, csvContent);
    //         console.log(`\nResults also written to '''${outputCsvFile}''' for review.`);
    //     } catch (e: any) {
    //         console.error(`Error writing to CSV ${outputCsvFile}: ${e.message}`);
    //     }
    // }
  } else {
    console.log(
      `No records were successfully parsed from '''${fileToParse}''', or an error occurred during parsing.`
    );
  }
}

main();
