import { inngest } from "./client";
import {
  getEBIDetails,
  sendNetAssetsAlert,
  sendPremiumDiscountAlert,
  fetchEbiApiResult,
  maybeSendEbiPerformanceAlert,
} from "../ebi";
import { fetchAndStoreManyPeRatios } from "@/src/holdings/fetch";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    console.log("[Inngest] Hello World");
    await step.sleep("wait-a-moment", "1s");
    return { message: `Hello ${event.data.email}!` };
  }
);

export const getEBIDetail = inngest.createFunction(
  {
    id: "get-ebi-detail",
    name: "Get EBI Detail",
  },
  {
    cron: "0 0 * * *",
  },
  async ({ step }) => {
    console.log("[Inngest] Getting EBI Detail");
    const ebiDetails = await step.run("get-ebi-detail", async () =>
      getEBIDetails()
    );

    const ebiApiResult = await step.run("fetch-ebi-api", async () =>
      fetchEbiApiResult()
    );

    const ebiPerformanceAlertEmail = await step.run(
      "ebi-performance-alert",
      async () => maybeSendEbiPerformanceAlert(ebiApiResult)
    );

    const ebiAssertions = await step.run("ebi-assertions", async () => {
      if (!ebiDetails) {
        return { message: "No EBI details" };
      }

      if (parseFloat(ebiDetails.premium_discount) < -0.2) {
        const email = await sendPremiumDiscountAlert(ebiDetails);
        return { message: "Premium is low", email };
      }

      const netAssets = parseFloat(ebiDetails.net_assets.replace(/,/g, ""));
      if (netAssets < 400_000_000) {
        const email = await sendNetAssetsAlert(ebiDetails);
        return { message: "Net assets are low", email };
      }

      return { message: "EBI is fine!" };
    });

    // Fetch P/E ratios for all ETFs (EBI + baselines)
    const peRatioResults = await step.run("fetch-pe-ratios", async () => {
      console.log("[Inngest] Fetching P/E ratios for all ETFs...");
      const allEtfs = ["EBI", "VTI", "VTV", "IWN", "IWV"];
      const results = await fetchAndStoreManyPeRatios(allEtfs, {});
      return {
        results: results.results,
        totalTime: results.totalTime,
      };
    });

    return {
      ebiAssertions,
      ebiDetails,
      ebiPerformanceAlertEmail,
      ebiApiResult,
      peRatioResults,
    };
  }
);
