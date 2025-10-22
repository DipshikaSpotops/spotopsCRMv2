import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import axios from "axios";
import { parseOrderHistory } from "../utils/formatter";
import { isInactiveYard } from "../utils/yards";

const API_BASE = "http://localhost:5000";

export default function useOrderDetails() {
  const location = useLocation();
  const { orderNo: orderNoFromPath } = useParams();

  const orderNoFromQuery = useMemo(
    () => new URLSearchParams(location.search).get("orderNo") || "",
    [location.search]
  );
  const orderNoWeird = useMemo(() => {
    const m = location.search.match(/^\?orders\/([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : "";
  }, [location.search]);
  const orderNoFromState = (location.state && location.state.orderNo) || "";

  const orderNo = useMemo(
    () => String(orderNoFromQuery || orderNoFromPath || orderNoWeird || orderNoFromState || "").trim(),
    [orderNoFromQuery, orderNoFromPath, orderNoWeird, orderNoFromState]
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState(null);

  const refresh = async () => {
    if (!orderNo) return;
    setLoading(true);
    setErr("");
    try {
      const res = await axios.get(`${API_BASE}/orders/${encodeURIComponent(orderNo)}`);
      setOrder(res.data || null);
      console.log("ORDER DATA:", res.data);

    } catch (e) {
      setErr(e.response?.data?.message || e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNo]);

  const timeline = useMemo(() => parseOrderHistory(order?.orderHistory), [order]);
  const yards = Array.isArray(order?.additionalInfo) ? order.additionalInfo : [];
  const canAddNewYard = useMemo(() => {
    if (!yards || yards.length === 0) return true;
    return yards.every(isInactiveYard);
  }, [yards]);

  return { API_BASE, orderNo, order, loading, error: err, timeline, yards, canAddNewYard, refresh };
}
