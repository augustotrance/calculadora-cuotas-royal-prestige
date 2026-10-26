import { loadGoogleRates } from "./rates-source.js";
// The User-authorized Google spreadsheet is the only authorized runtime source.
// Neither an environment variable nor a local attachment may replace it.
export const OFFICIAL_SHEET_URL = "https://docs.google.com/spreadsheets/d/12OZfGSeKwJu0jwaCznipZB7mSBGBx7-A6b87kWlrsPs/edit?usp=drive_link";
export const OFFICIAL_SHEET_ID = "12OZfGSeKwJu0jwaCznipZB7mSBGBx7-A6b87kWlrsPs";
export const APP_NAME = "Calculadora de cuotas de Royal Prestige - Lista Sep2026";
export function loadOfficialRates(fetcher = fetch) {
    return loadGoogleRates(OFFICIAL_SHEET_URL, fetcher);
}
