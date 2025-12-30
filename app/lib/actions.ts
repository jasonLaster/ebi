/**
 * Client-side actions for the ETF dashboard
 */

/**
 * Downloads ETF holdings as a JSON file
 * @param symbol - The ETF symbol (e.g., "EBI", "VTI")
 */
export async function downloadHoldings(symbol: string): Promise<void> {
  try {
    const response = await fetch(`/api/holdings/${symbol}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || `Failed to fetch holdings for ${symbol}`
      );
    }

    const data = await response.json();

    // Create a blob and trigger download
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${symbol.toLowerCase()}_holdings.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(`Error downloading holdings for ${symbol}:`, err);
    throw err;
  }
}
