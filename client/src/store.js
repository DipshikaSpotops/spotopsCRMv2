// /src/store.js
import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./store/authSlice";
import { monthlyOrdersApi } from "./services/monthlyOrdersApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [monthlyOrdersApi.reducerPath]: monthlyOrdersApi.reducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(monthlyOrdersApi.middleware),
});
