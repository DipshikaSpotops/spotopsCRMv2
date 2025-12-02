import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { parseOrderHistory } from "../utils/formatter";
import { isInactiveYard } from "../utils/yards";
import API from "../api";

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
    if (!orderNo) {
      setOrder(null);
      setErr("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    // Clear previous order immediately when fetching new one
    setOrder(null);
    try {
      const { data } = await API.get(`/orders/${encodeURIComponent(orderNo)}`);
      setOrder(data || null);
      console.log("ORDER DATA coming from useOrderDEtails page inside hooks:", data);

    } catch (e) {
      // Clear order state on error (especially 404)
      setOrder(null);
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

  const mutateOrder = (next) => {
    setOrder((prev) => {
      if (typeof next === "function") {
        return next(prev);
      }
      return next || null;
    });
  };

  return { orderNo, order, loading, error: err, timeline, yards, canAddNewYard, refresh, mutateOrder };
}
