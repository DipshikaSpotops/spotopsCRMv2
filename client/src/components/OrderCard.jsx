import React, { useState } from "react";

const OrderCard = ({ order }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-xl p-4 border border-gray-200">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">{order.orderNo}</h2>
        <span className="px-2 py-1 text-sm bg-blue-100 text-blue-700 rounded">
          {order.orderStatus}
        </span>
      </div>

      <p className="text-gray-600 mt-2 text-sm">
        <strong>Agent:</strong> {order.salesAgent || "N/A"}
      </p>

      <p className="text-gray-600 text-sm">
        <strong>Date:</strong> {new Date(order.orderDate).toLocaleDateString()}
      </p>

      {expanded && (
        <div className="mt-3 text-sm text-gray-700 dark:text-gray-300">
          <p><strong>Customer:</strong> {order.customerInfo?.name}</p>
          <p><strong>Shipping:</strong> {order.shippingInfo?.address}</p>
          <p><strong>Parts:</strong> {order.partInfo?.join(", ")}</p>
        </div>
      )}

      <button
        className="text-blue-500 mt-3 text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Hide Details ▲" : "Show Details ▼"}
      </button>
    </div>
  );
};

export default OrderCard;
