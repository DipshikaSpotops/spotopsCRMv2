// /src/services/monthlyOrdersApi.js
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { selectToken } from "../store/authSlice";

function getLsToken() {
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const { token } = JSON.parse(raw) || {};
      if (token) return token;
    }
  } catch {}
  return localStorage.getItem("token") || null;
}

function buildQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") sp.append(k, v);
  });
  if (!sp.has("page")) sp.set("page", "1");
  if (!sp.has("limit")) sp.set("limit", "25");
  return sp.toString();
}

const API_BASE =
  (import.meta && import.meta.env && import.meta.env.VITE_API_BASE_URL_URL);

export const monthlyOrdersApi = createApi({
  reducerPath: "monthlyOrdersApi",
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE,
    prepareHeaders: (headers, { getState }) => {
      const token = selectToken(getState()) || getLsToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  endpoints: (builder) => ({
    getMonthlyOrdersAll: builder.query({
      async queryFn(args, _api, _extra, fetchWithBQ) {
        const firstQS = buildQuery({ ...args, page: 1 });
        const first = await fetchWithBQ(`/orders/monthlyOrders?${firstQS}`);
        if (first.error) return { error: first.error };

        const { orders: firstOrders = [], totalPages = 1 } = first.data || {};
        let allOrders = [...firstOrders];

        if (totalPages > 1) {
          const reqs = [];
          for (let p = 2; p <= totalPages; p++) {
            const qs = buildQuery({ ...args, page: p });
            reqs.push(fetchWithBQ(`/orders/monthlyOrders?${qs}`));
          }
          const results = await Promise.all(reqs);
          results.forEach((res) => {
            if (!res.error) allOrders = allOrders.concat(res.data?.orders || []);
          });
        }
        return { data: allOrders };
      },
    }),
  }),
});

export const { useGetMonthlyOrdersAllQuery } = monthlyOrdersApi;
