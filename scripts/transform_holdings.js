"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = __importStar(require("fs/promises"));
var path = __importStar(require("path"));
function parseFloatSafe(value) {
    var cleanedValue = value.replace(/,/g, "");
    var num = parseFloat(cleanedValue);
    return isNaN(num) ? null : num;
}
function transformHoldings() {
    return __awaiter(this, void 0, void 0, function () {
        var inputFile, outputFile, fileContent, inputData, outputData, _i, inputData_1, item, ticker, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    inputFile = path.join(__dirname, "data", "ebi_holdings.json");
                    outputFile = path.join(__dirname, "data", "ebi_holdings_transformed.json");
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    console.log("Reading input file: ".concat(inputFile));
                    return [4 /*yield*/, fs.readFile(inputFile, "utf-8")];
                case 2:
                    fileContent = _a.sent();
                    inputData = JSON.parse(fileContent);
                    console.log("Successfully read ".concat(inputData.length, " records from input file."));
                    outputData = {
                        etfSymbol: "EBI",
                        lastUpdated: new Date().toISOString(),
                        holdings: {},
                    };
                    for (_i = 0, inputData_1 = inputData; _i < inputData_1.length; _i++) {
                        item = inputData_1[_i];
                        ticker = item["Stock Ticker"];
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
                            actual_weight: typeof item["actual_weighting"] === "number"
                                ? item["actual_weighting"]
                                : null,
                            price: parseFloatSafe(item["Price"]),
                        };
                    }
                    console.log("Writing transformed data to: ".concat(outputFile));
                    return [4 /*yield*/, fs.writeFile(outputFile, JSON.stringify(outputData, null, 2))];
                case 3:
                    _a.sent();
                    console.log("Transformation complete. Output written to", outputFile);
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("Error during transformation:", error_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
transformHoldings();
