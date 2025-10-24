// import { StrictMode } from 'react'
// import { createRoot } from 'react-dom/client'
// import '@fortawesome/fontawesome-free/css/all.min.css';
// import './index.css'
// import App from './App.jsx'

// createRoot(document.getElementById('root')).render(
//   <StrictMode>
//     <App />
//   </StrictMode>,
// )
// src/main.jsx or src/index.jsx (depending on your setup)
import React from "react";
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css'
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store";
import App from "./App";
import "./api/axios";

ReactDOM.createRoot(document.getElementById("root")).render(
  <Provider store={store}>
    <App />
  </Provider>
);
