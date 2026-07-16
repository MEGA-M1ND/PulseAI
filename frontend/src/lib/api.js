import axios from "axios";

const api = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

export default api;

export const CATEGORY_SHORT = {
  "AI Models": "Models",
  "Chips & Compute": "Chips",
  "Business & Funding": "Funding",
  "Policy & Regulation": "Policy",
  "Security": "Security",
  "Research": "Research",
  "Products & Tools": "Products",
  "Markets": "Markets",
};

export const categorySlug = (cat) =>
  (cat || "news").toLowerCase().replace(/\s*&\s*/g, "-and-").replace(/\s+/g, "-");
