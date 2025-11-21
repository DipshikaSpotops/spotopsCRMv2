import { useEffect, useMemo, useRef, useState } from "react";
import API from "../../../api";

const ESC_CAUSES = [
  "Damaged",
  "Defective",
  "Incorrect",
  "Not programming",
  "Personal reason",
  "Other",
];

const SHIPPING_METHODS = ["Customer shipping", "Own shipping", "Yard shipping"];
const SHIPPING_STATUS = ["Ready to ship", "In Transit", "Delivered"];
const SHIPPERS = ["UPS", "FedEx", "World Wide Express", "USPS", "Others"];

const toStr = (v) => (v == null ? "" : String(v));

const getChicagoIso = () => {
  const now = new Date();
  const chicagoString = now.toLocaleString("en-US", { timeZone: "America/Chicago" });
  const chicago = new Date(chicagoString);
  return chicago.toISOString();
};

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-4 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-black shadow-lg">
      <span>{message}</span>
      <button
        onClick={onClose}
        className="rounded-md bg-[#04356d] px-3 py-1 text-sm font-semibold text-white transition hover:bg-[#021f4b]"
      >
        OK
      </button>
    </div>
  );
}

const initialState = {
  escalationProcess: "",
  escalationCause: "",
  custReason: "",
  customerShippingMethodReplacement: "",
  custOwnShipReplacement: "",
  customerShipperReplacement: "",
  customerTrackingNumberReplacement: "",
  customerETAReplacement: "",
  custreplacementDelivery: "",
  yardShippingStatus: "",
  yardShippingMethod: "",
  yardOwnShipping: "",
  yardShipper: "",
  yardTrackingNumber: "",
  yardTrackingETA: "",
  yardTrackingLink: "",
  shipToReplacement: "",
  customerShippingMethodReturn: "",
  custOwnShippingReturn: "",
  customerShipperReturn: "",
  returnTrackingCust: "",
  custretPartETA: "",
  custReturnDelivery: "",
  shipToReturn: "",
};

export default function YardEscalationModal({
  open,
  yard,
  yardIndex,
  order,
  onClose,
  onSaved,
}) {
  const [state, setState] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [toastPersistent, setToastPersistent] = useState(false);
  const [replacementEmailTarget, setReplacementEmailTarget] = useState(
    "Part from Customer"
  );
  const [replacementFile, setReplacementFile] = useState(null);
  const [showReplacementFileInput, setShowReplacementFileInput] = useState(false);
  const [returnFile, setReturnFile] = useState(null);
  const [showReturnFileInput, setShowReturnFileInput] = useState(false);
  const closeTimerRef = useRef(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  const rootApiBase = useMemo(() => {
    const base = API?.defaults?.baseURL || "";
    return base.replace(/\/api$/, "");
  }, []);

  const defaultShipToReplacement = useMemo(() => {
    if (!yard) return "";
    return (
      toStr(yard?.custShipToRep) ||
      `${toStr(yard?.street)} ${toStr(yard?.city)} ${toStr(
        yard?.state
      )} ${toStr(yard?.zipcode)}`.trim()
    );
  }, [yard]);

  const defaultShipToReturn = useMemo(() => {
    if (!yard) return "";
    return (
      toStr(yard?.custShipToRet) ||
      `${toStr(yard?.street)} ${toStr(yard?.city)} ${toStr(
        yard?.state
      )} ${toStr(yard?.zipcode)}`.trim()
    );
  }, [yard]);

  const isReplacement = state.escalationProcess === "Replacement";
  const isReturn = state.escalationProcess === "Return";

  useEffect(() => {
    if (!open) return;
    const next = {
      escalationProcess: toStr(yard?.escalationProcess) || "",
      escalationCause: toStr(yard?.escalationCause) || "",
      custReason: toStr(yard?.custReason) || "",
      customerShippingMethodReplacement: toStr(
        yard?.customerShippingMethodReplacement
      ) || "",
      custOwnShipReplacement: toStr(yard?.custOwnShipReplacement) || "",
      customerShipperReplacement: toStr(yard?.customerShipperReplacement) || "",
      customerTrackingNumberReplacement: toStr(
        yard?.customerTrackingNumberReplacement
      ) || "",
      customerETAReplacement: toStr(yard?.customerETAReplacement) || "",
      custreplacementDelivery: toStr(yard?.custreplacementDelivery) || "",
      yardShippingStatus: toStr(yard?.yardShippingStatus) || "",
      yardShippingMethod: toStr(yard?.yardShippingMethod) || "",
      yardOwnShipping: toStr(yard?.yardOwnShipping) || "",
      yardShipper: toStr(yard?.yardShipper) || "",
      yardTrackingNumber: toStr(yard?.yardTrackingNumber) || "",
      yardTrackingETA: toStr(yard?.yardTrackingETA) || "",
      yardTrackingLink: toStr(yard?.yardTrackingLink) || "",
      shipToReplacement: defaultShipToReplacement,
      customerShippingMethodReturn: toStr(yard?.customerShippingMethodReturn) || "",
      custOwnShippingReturn: toStr(yard?.custOwnShippingReturn) || "",
      customerShipperReturn: toStr(yard?.customerShipperReturn) || "",
      returnTrackingCust: toStr(yard?.returnTrackingCust) || "",
      custretPartETA: toStr(yard?.custretPartETA) || "",
      custReturnDelivery: toStr(yard?.custReturnDelivery) || "",
      shipToReturn: defaultShipToReturn,
    };
    setState(next);
    setToast("");
  }, [open, yard, defaultShipToReplacement, defaultShipToReturn]);

  useEffect(() => {
    if (!open) return;
    setReplacementEmailTarget("Part from Customer");
    setReplacementFile(null);
    setShowReplacementFileInput(false);
    setReturnFile(null);
    setShowReturnFileInput(false);
  }, [open]);

  useEffect(() => {
    if (
      state.customerShippingMethodReplacement !== "Own shipping" &&
      state.custOwnShipReplacement
    ) {
      setState((prev) => ({ ...prev, custOwnShipReplacement: "" }));
    }
  }, [state.customerShippingMethodReplacement]);

  useEffect(() => {
    if (state.yardShippingMethod !== "Own shipping" && state.yardOwnShipping) {
      setState((prev) => ({ ...prev, yardOwnShipping: "" }));
    }
  }, [state.yardShippingMethod]);

  useEffect(() => {
    if (
      state.customerShippingMethodReturn !== "Own shipping" &&
      state.custOwnShippingReturn
    ) {
      setState((prev) => ({ ...prev, custOwnShippingReturn: "" }));
    }
  }, [state.customerShippingMethodReturn]);

  const handleChange = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setState((prev) => ({ ...prev, [key]: value }));
  };

useEffect(() => {
  if (!open || state.custReason !== "Junked") return;

  const hasCustomerData = [
    state.shipToReplacement,
    state.customerShippingMethodReplacement,
    state.custOwnShipReplacement,
    state.customerShipperReplacement,
    state.customerTrackingNumberReplacement,
    state.customerETAReplacement,
    state.custreplacementDelivery,
  ].some((val) => !!toStr(val));

  if (hasCustomerData) {
    setState((prev) => ({
      ...prev,
      shipToReplacement: "",
      customerShippingMethodReplacement: "",
      custOwnShipReplacement: "",
      customerShipperReplacement: "",
      customerTrackingNumberReplacement: "",
      customerETAReplacement: "",
      custreplacementDelivery: "",
    }));
  }

  if (replacementEmailTarget === "Part from Customer") {
    setReplacementEmailTarget("Part from Yard");
  }

  if (showReplacementFileInput || replacementFile) {
    setShowReplacementFileInput(false);
    setReplacementFile(null);
  }
}, [
  open,
  state.custReason,
  state.shipToReplacement,
  state.customerShippingMethodReplacement,
  state.custOwnShipReplacement,
  state.customerShipperReplacement,
  state.customerTrackingNumberReplacement,
  state.customerETAReplacement,
  state.custreplacementDelivery,
  replacementEmailTarget,
  showReplacementFileInput,
  replacementFile,
]);

  useEffect(() => {
    if (!open) return;
    if (
      state.custReason !== "Junked" &&
      !toStr(state.shipToReplacement) &&
      defaultShipToReplacement
    ) {
      setState((prev) => ({
        ...prev,
        shipToReplacement: defaultShipToReplacement,
      }));
    }
  }, [open, state.custReason, state.shipToReplacement, defaultShipToReplacement]);

  useEffect(() => {
    if (!open) return;
    if (!toStr(state.shipToReturn) && defaultShipToReturn) {
      setState((prev) => ({
        ...prev,
        shipToReturn: defaultShipToReturn,
      }));
    }
  }, [open, state.shipToReturn, defaultShipToReturn]);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    },
    []
  );

  const scheduleAutoClose = (delay = 2500) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    if (delay === null) return;
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setToast("");
      setToastPersistent(false);
    }, delay);
  };

  const buildEscalationPayload = (isoNow) => {
    const payload = {
      escalationProcess: state.escalationProcess,
      escalationCause: state.escalationCause,
      escTicked: "Yes",
      status: yard?.status === "Escalation" ? yard.status : "Escalation",
      escalationDate: yard?.escalationDate || isoNow,
    };

    if (order?.orderStatus !== "Escalation") {
      payload.orderStatus = "Escalation";
    }

    if (state.escalationProcess === "Replacement") {
      payload.custReason = state.custReason;
      const shouldBlankReplacement =
        state.custReason === "Junked" || !state.custReason;

      if (shouldBlankReplacement) {
        payload.customerShippingMethodReplacement = "";
        payload.custOwnShipReplacement = "";
        payload.customerShipperReplacement = "";
        payload.customerTrackingNumberReplacement = "";
        payload.customerETAReplacement = "";
        payload.custreplacementDelivery = "";
        payload.yardShippingStatus = "";
        payload.yardShippingMethod = "";
        payload.yardOwnShipping = "";
        payload.yardShipper = "";
        payload.yardTrackingNumber = "";
        payload.yardTrackingETA = "";
        payload.yardTrackingLink = "";
        payload.custShipToRep = "";
      } else {
        payload.customerShippingMethodReplacement =
          state.customerShippingMethodReplacement;
        payload.custOwnShipReplacement =
          state.customerShippingMethodReplacement === "Own shipping"
            ? state.custOwnShipReplacement
            : "";
        payload.customerShipperReplacement = state.customerShipperReplacement;
        payload.customerTrackingNumberReplacement =
          state.customerTrackingNumberReplacement;
        payload.customerETAReplacement = state.customerETAReplacement;
        payload.custreplacementDelivery = state.custreplacementDelivery;
        payload.yardShippingStatus = state.yardShippingStatus;
        payload.yardShippingMethod = state.yardShippingMethod;
        payload.yardOwnShipping =
          state.yardShippingMethod === "Own shipping" ? state.yardOwnShipping : "";
        payload.yardShipper = state.yardShipper;
        payload.yardTrackingNumber = state.yardTrackingNumber;
        payload.yardTrackingETA = state.yardTrackingETA;
        payload.yardTrackingLink = state.yardTrackingLink;
        payload.custShipToRep = state.shipToReplacement;
      }
    } else {
      payload.custReason = "";
      payload.customerShippingMethodReplacement = "";
      payload.custOwnShipReplacement = "";
      payload.customerShipperReplacement = "";
      payload.customerTrackingNumberReplacement = "";
      payload.customerETAReplacement = "";
      payload.custreplacementDelivery = "";
      payload.yardShippingStatus = "";
      payload.yardShippingMethod = "";
      payload.yardOwnShipping = "";
      payload.yardShipper = "";
      payload.yardTrackingNumber = "";
      payload.yardTrackingETA = "";
      payload.yardTrackingLink = "";
      payload.custShipToRep = "";
    }

    if (state.escalationProcess === "Return") {
      payload.customerShippingMethodReturn = state.customerShippingMethodReturn;
      payload.custOwnShippingReturn =
        state.customerShippingMethodReturn === "Own shipping"
          ? state.custOwnShippingReturn
          : "";
      payload.customerShipperReturn = state.customerShipperReturn;
      payload.returnTrackingCust = state.returnTrackingCust;
      payload.custretPartETA = state.custretPartETA;
      payload.custReturnDelivery = state.custReturnDelivery;
      payload.custShipToRet = state.shipToReturn;
    } else {
      payload.customerShippingMethodReturn = "";
      payload.custOwnShippingReturn = "";
      payload.customerShipperReturn = "";
      payload.returnTrackingCust = "";
      payload.custretPartETA = "";
      payload.custReturnDelivery = "";
      payload.custShipToRet = "";
    }

    return payload;
  };

  const requireField = (value) => toStr(value).trim().length > 0;

  const persistEscalation = async ({ skipToast = false } = {}) => {
    if (!order?.orderNo) {
      setToastPersistent(true);
      setToast("Order info missing.");
      return null;
    }
    if (!state.escalationCause) {
      setToastPersistent(true);
      setToast("Escalation reason is required.");
      return null;
    }

    if (state.customerShippingMethodReplacement === "Own shipping") {
      if (!requireField(state.custOwnShipReplacement)) {
        setToastPersistent(true);
        setToast("Enter the own shipping value before saving.");
        return null;
      }
      if (!requireField(state.customerShipperReplacement)) {
        setToastPersistent(true);
        setToast("Select the shipper name before saving.");
        return null;
      }
      if (!requireField(state.customerTrackingNumberReplacement)) {
        setToastPersistent(true);
        setToast("Enter the tracking number before saving.");
        return null;
      }
    }

    if (state.yardShippingMethod === "Own shipping") {
      if (!requireField(state.yardOwnShipping)) {
        setToastPersistent(true);
        setToast("Enter the own shipping value before saving.");
        return null;
      }
      if (!requireField(state.yardShipper)) {
        setToastPersistent(true);
        setToast("Select the shipper before saving.");
        return null;
      }
      if (!requireField(state.yardTrackingNumber)) {
        setToastPersistent(true);
        setToast("Enter the tracking number before saving.");
        return null;
      }
    }

    if (state.customerShippingMethodReturn === "Own shipping") {
      if (!requireField(state.custOwnShippingReturn)) {
        setToastPersistent(true);
        setToast("Enter the own shipping return value before saving.");
        return null;
      }
      if (!requireField(state.customerShipperReturn)) {
        setToastPersistent(true);
        setToast("Select the return shipper before saving.");
        return null;
      }
      if (!requireField(state.returnTrackingCust)) {
        setToastPersistent(true);
        setToast("Enter the customer's return tracking number before saving.");
        return null;
      }
    }

    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;
    const idx1 = (yardIndex ?? 0) + 1;
    const isoNow = getChicagoIso();
    const payload = buildEscalationPayload(isoNow);

    setSaving(true);
    try {
      await API.put(
        `/orders/${encodeURIComponent(orderNo)}/additionalInfo/${idx1}`,
        payload,
        { params: { firstName } }
      );
      if (!skipToast) {
        setToastPersistent(false);
        setToast("Escalation details saved.");
      }
      onSaved?.();
      return payload;
    } catch (err) {
      console.error("Error saving escalation details:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to save escalation details.";
      setToastPersistent(true);
      setToast(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const result = await persistEscalation();
    if (result) {
      scheduleAutoClose();
    }
  };

  const handleReplacementSendEmail = async () => {
    if (disableCustomerEmailActions) {
      setToastPersistent(true);
      setToast("Part from Customer flow is disabled when the reason is Junked.");
      return;
    }
    if (!order?.orderNo) {
      setToastPersistent(true);
      setToast("Order info missing.");
      return;
    }

    const shippingMethod = state.customerShippingMethodReplacement;
    if (!shippingMethod) {
      setToastPersistent(true);
      setToast("Select the customer shipping method before sending email.");
      return;
    }

    if (!state.shipToReplacement) {
      setToastPersistent(true);
      setToast("Enter the replacement ship-to address before sending email.");
      return;
    }

    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;

    if (replacementEmailTarget === "Part from Yard") {
      const savedPayload = await persistEscalation({ skipToast: true });
      if (!savedPayload) return;
      if (
        !requireField(state.yardShippingStatus) ||
        !requireField(state.yardShippingMethod) ||
        !requireField(state.yardShipper) ||
        !requireField(state.yardTrackingNumber) ||
        !requireField(state.yardTrackingLink)
      ) {
        setToastPersistent(true);
        setToast(
          "Fill yard shipping status, method, shipper, tracking number, and tracking link before sending email."
        );
        return;
      }
      setReplacementEmailTarget("Part from Yard");
      setPendingConfirmation({
        label: "Replacement (Part from Yard)",
        onConfirm: async () => {
          await handleSendTrackingEmail();
        },
      });
      setToastPersistent(true);
      setToast("Ready to send Part from Yard email — click Confirm to proceed.");
      return;
    }

    const savedPayload = await persistEscalation({ skipToast: true });
    if (!savedPayload) {
      return;
    }

    setPendingConfirmation({
      label: "Replacement (Part from Customer)",
      onConfirm: async () => {
        await sendCustomerReplacementEmail(orderNo, shippingMethod, firstName);
      },
    });
    setToastPersistent(true);
    setToast("Ready to send Part from Customer email — click Confirm to proceed.");
  };

  const sendCustomerReplacementEmail = async (orderNo, shippingMethod, firstName) => {
    const idx1 = (yardIndex ?? 0) + 1;

    setSendingEmail(true);
    try {
      if (shippingMethod === "Customer shipping") {
        await API.post(
          `/emails/orders/sendReplaceEmailCustomerShipping/${encodeURIComponent(orderNo)}`,
          null,
          {
            baseURL: rootApiBase || undefined,
            params: {
              yardIndex: idx1,
              retAddressReplacement: state.shipToReplacement,
              firstName,
            },
          }
        );
        setToastPersistent(false);
        setToast("Escalation details saved and replacement email sent (Customer shipping).");
        scheduleAutoClose();
      } else if (shippingMethod === "Own shipping" || shippingMethod === "Yard shipping") {
        if (shippingMethod === "Own shipping" && !requireField(state.custOwnShipReplacement)) {
          setToastPersistent(true);
          setToast("Enter the own shipping value before sending this email.");
          setSendingEmail(false);
          return;
        }
        if (!replacementFile) {
          setToastPersistent(true);
          setToast("Attach the document before sending this email.");
          setSendingEmail(false);
          return;
        }
        const formData = new FormData();
        formData.append("pdfFile", replacementFile);
        await API.post(
          `/emails/orders/sendReplaceEmailOwn_Yard/${encodeURIComponent(orderNo)}`,
          formData,
          {
            baseURL: rootApiBase || undefined,
            params: { yardIndex: idx1, firstName },
          }
        );
        const methodLabel = shippingMethod === "Own shipping" ? "Own shipping" : "Yard shipping";
        setToastPersistent(false);
        setToast(
          `Escalation details saved and replacement email sent (${methodLabel}).`
        );
        scheduleAutoClose();
      } else {
        setToastPersistent(true);
        setToast("Unsupported shipping method for replacement flow.");
      }
    } catch (err) {
      console.error("Replacement email failed:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to send replacement email.";
      setToastPersistent(true);
      setToast(message);
    } finally {
      setSendingEmail(false);
      setPendingConfirmation(null);
    }
  };

  const handleReturnSendEmail = async () => {
    if (!order?.orderNo) {
      setToastPersistent(true);
      setToast("Order info missing.");
      return;
    }
    const shippingMethod = state.customerShippingMethodReturn;
    if (!shippingMethod) {
      setToastPersistent(true);
      setToast("Select the return shipping method before sending email.");
      return;
    }
    if (!state.shipToReturn) {
      setToastPersistent(true);
      setToast("Enter the return ship-to address before sending email.");
      return;
    }
    if (shippingMethod === "Own shipping" && !returnFile) {
      setToastPersistent(true);
      setToast("Attach the document before sending this email.");
      return;
    }

    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;
    const idx1 = (yardIndex ?? 0) + 1;

    const savedPayload = await persistEscalation({ skipToast: true });
    if (!savedPayload) {
      return;
    }

    setSendingEmail(true);
    try {
      if (shippingMethod === "Customer shipping") {
        await API.post(
          `/emails/orders/sendReturnEmailCustomerShipping/${encodeURIComponent(orderNo)}`,
          null,
          {
            baseURL: rootApiBase || undefined,
            params: {
              yardIndex: idx1,
              retAddress: state.shipToReturn,
              firstName,
            },
          }
        );
        setToastPersistent(false);
        setToast("Escalation details saved and return email sent (Customer shipping).");
        scheduleAutoClose();
      } else if (shippingMethod === "Own shipping" || shippingMethod === "Yard shipping") {
        if (!returnFile) {
          setToastPersistent(true);
          setToast("Attach the document before sending this email.");
          setSendingEmail(false);
          return;
        }
        const formData = new FormData();
        formData.append("pdfFile", returnFile);
        await API.post(
          `/emails/orders/sendReturnEmailOwn_Yard/${encodeURIComponent(orderNo)}`,
          formData,
          {
            baseURL: rootApiBase || undefined,
            params: {
              yardIndex: idx1,
              retAddress: state.shipToReturn,
              firstName,
            },
          }
        );
        const methodLabel = shippingMethod === "Own shipping" ? "Own shipping" : "Yard shipping";
        setToastPersistent(false);
        setToast(`Escalation details saved and return email sent (${methodLabel}).`);
        scheduleAutoClose();
      } else {
        setToastPersistent(true);
        setToast("Unsupported return shipping method.");
      }
    } catch (err) {
      console.error("Return email failed:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to send return email.";
      setToastPersistent(true);
      setToast(message);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleVoidReplacement = async (target) => {
    if (!order?.orderNo || !yard) {
      setToastPersistent(true);
      setToast("Order or yard information is missing.");
      return;
    }

    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;
    const idx1 = (yardIndex ?? 0) + 1;

    const payload = { ...yard };
    if (target === "customer") {
      payload.customerTrackingNumberReplacement = "";
      payload.customerETAReplacement = "";
      payload.customerShipperReplacement = "";
      payload.customerShippingMethodReplacement = "";
      payload.custOwnShipReplacement = "";
    } else {
      payload.yardTrackingNumber = "";
      payload.yardTrackingETA = "";
      payload.yardShipper = "";
      payload.yardShippingMethod = "";
      payload.yardOwnShipping = "";
    }

    setActionLoading(true);
    try {
      const endpoint =
        target === "customer"
          ? `/orders/voidLabelRepCust/${encodeURIComponent(orderNo)}/${idx1}`
          : `/orders/voidLabelRepYard/${encodeURIComponent(orderNo)}/${idx1}`;

      await API.put(endpoint, payload, { params: { firstName } });

      if (target === "customer") {
        setState((prev) => ({
          ...prev,
          customerTrackingNumberReplacement: "",
          customerETAReplacement: "",
          customerShipperReplacement: "",
          customerShippingMethodReplacement: "",
          custOwnShipReplacement: "",
        }));
      } else {
        setState((prev) => ({
          ...prev,
          yardTrackingNumber: "",
          yardTrackingETA: "",
          yardShipper: "",
          yardShippingMethod: "",
          yardOwnShipping: "",
        }));
      }

      setToastPersistent(false);
      setToast("Label voided successfully.");
      onSaved?.();
    } catch (err) {
      console.error("Void label failed:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to void the label.";
      setToastPersistent(true);
      setToast(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidReturn = async () => {
    if (!order?.orderNo || !yard) {
      setToastPersistent(true);
      setToast("Order or yard information is missing.");
      return;
    }

    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;
    const idx1 = (yardIndex ?? 0) + 1;

    const payload = { ...yard };
    payload.returnTrackingCust = "";
    payload.custretPartETA = "";
    payload.customerShipperReturn = "";
    payload.customerShippingMethodReturn = "";
    payload.custOwnShippingReturn = "";
    payload.custReturnDelivery = "";

    setActionLoading(true);
    try {
      await API.put(
        `/orders/voidLabelReturn/${encodeURIComponent(orderNo)}/${idx1}`,
        payload,
        { params: { firstName } }
      );

      setState((prev) => ({
        ...prev,
        returnTrackingCust: "",
        custretPartETA: "",
        customerShipperReturn: "",
        customerShippingMethodReturn: "",
        custOwnShippingReturn: "",
        custReturnDelivery: "",
      }));
      setToastPersistent(false);
      setToast("Return label voided successfully.");
      onSaved?.();
    } catch (err) {
      console.error("Void return label failed:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to void the return label.";
      setToastPersistent(true);
      setToast(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendTrackingEmail = async () => {
    if (!order?.orderNo) {
      setToastPersistent(true);
      setToast("Order info missing.");
      return;
    }
    if (
      !requireField(state.yardShippingStatus) ||
      !requireField(state.yardShippingMethod) ||
      !requireField(state.yardShipper) ||
      !requireField(state.yardTrackingNumber)
    ) {
      setToastPersistent(true);
      setToast(
        "Provide yard shipping status, method, shipper, and tracking number before sending email."
      );
      return;
    }
    const firstName = localStorage.getItem("firstName") || "System";
    const orderNo = order.orderNo;
    setSendingEmail(true);
    try {
      await API.post(
        `/emails/orders/sendTrackingInfo/${encodeURIComponent(orderNo)}`,
        {
          trackingNo: state.yardTrackingNumber,
          eta: state.yardTrackingETA,
          shipperName: state.yardShipper,
          link: state.yardTrackingLink,
          firstName,
        },
        {
          baseURL: rootApiBase || undefined,
        }
      );
      setToastPersistent(false);
      setToast("Tracking email sent successfully.");
    } catch (err) {
      console.error("Tracking email failed:", err);
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to send tracking email.";
      setToastPersistent(true);
      setToast(message);
    } finally {
      setSendingEmail(false);
    }
  };

  const disableReplacementCustomerFields = state.custReason === "Junked";
  const canVoidReplacementCustomer =
    !disableReplacementCustomerFields &&
    state.customerShippingMethodReplacement === "Own shipping";
  const canVoidReplacementYard = state.yardShippingMethod === "Own shipping";
  const canVoidReturn = state.customerShippingMethodReturn === "Own shipping";
  const disableCustomerEmailActions =
    disableReplacementCustomerFields &&
    replacementEmailTarget === "Part from Customer";
  const returnRequiresAttachment =
    state.customerShippingMethodReturn === "Own shipping";
  const returnEmailDisabled =
    sendingEmail || (returnRequiresAttachment && !returnFile);

  if (!open) return null;

  const yardLabel = typeof yardIndex === "number" ? yardIndex + 1 : 1;

  return (
    <>
      <style>{`
        /* YardEscalationModal Light Mode Styles */
        html:not(.dark) .yard-escalation-modal-container {
          background: rgba(240, 249, 255, 0.95) !important;
          border: 1.5px solid rgba(59, 130, 246, 0.3) !important;
          color: #1a1a1a !important;
          overflow: hidden !important;
        }
        /* Labels and non-button text */
        html:not(.dark) .yard-escalation-modal-container label {
          color: #1a1a1a !important;
          font-weight: 600 !important;
        }
        html:not(.dark) .yard-escalation-modal-container h4 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .yard-escalation-modal-container p:not(button p),
        html:not(.dark) .yard-escalation-modal-container span:not(button span),
        html:not(.dark) .yard-escalation-modal-container div:not(button):not(button *) {
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container .text-white\/80:not(button):not(button *) {
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container .text-white\/70:not(button):not(button *) {
          color: #475569 !important;
        }
        /* BUTTON TEXT COLORS - Very specific rules with high priority */
        /* Send Email buttons - bg-white with text-[#04356d] MUST have blue text */
        html:not(.dark) .yard-escalation-modal-container button.bg-white.text-\[#04356d\],
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white"][class*="text-[#04356d]"]:not(:disabled) {
          color: #04356d !important;
          background: #ffffff !important;
        }
        /* Buttons with bg-white/10 - dark text and visible background */
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/10,
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/10"]:not([class*="bg-white text-"]) {
          background: rgba(219, 234, 254, 0.9) !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/10.text-white,
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/10"][class*="text-white"]:not([class*="bg-white text-"]) {
          color: #1a1a1a !important;
          background: rgba(219, 234, 254, 0.9) !important;
        }
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/10:hover:not(:disabled),
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/10"]:hover:not(:disabled):not([class*="bg-white text-"]) {
          background: rgba(191, 219, 254, 1) !important;
          border-color: rgba(59, 130, 246, 0.6) !important;
        }
        /* Disabled buttons with bg-white/20 */
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/20,
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/20"] {
          background: rgba(229, 231, 235, 0.7) !important;
          border-color: rgba(209, 213, 219, 0.6) !important;
          color: #6b7280 !important;
        }
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/20.text-white,
        html:not(.dark) .yard-escalation-modal-container button.bg-white\/20.text-white\/70,
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/20"][class*="text-white"] {
          color: #6b7280 !important;
        }
        /* Additional catch-all for any button with bg-white/10 in class list */
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/10"]:not([class*="bg-white text-[#04356d]"]):not(.yard-escalation-modal-submit-btn) {
          color: #1a1a1a !important;
          background: rgba(219, 234, 254, 0.9) !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        /* Submit button - blue background with white text */
        html:not(.dark) .yard-escalation-modal-submit-btn:not(:disabled) {
          background: #1e40af !important;
          color: #ffffff !important;
          border-color: #1e40af !important;
        }
        /* Other specific button colors */
        html:not(.dark) .yard-escalation-modal-container button.bg-\[#04356d\] {
          color: #ffffff !important;
        }
        html:not(.dark) .yard-escalation-modal-container button.bg-amber-600 {
          color: #ffffff !important;
        }
        html:not(.dark) .yard-escalation-modal-container button.text-amber-700 {
          color: #b45309 !important;
        }
        /* Fallback: any other button with text-white gets dark text */
        html:not(.dark) .yard-escalation-modal-container button.text-white:not(.yard-escalation-modal-submit-btn):not(.bg-\[#04356d\]):not(.bg-amber-600):not(.bg-white.text-\[#04356d\]):not([class*="bg-white text-[#04356d]"]) {
          color: #1a1a1a !important;
        }
        /* Ensure all buttons with light backgrounds have visible borders and text */
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white"]:not(.bg-white.text-\[#04356d\]):not(.yard-escalation-modal-submit-btn):not([class*="bg-white text-[#04356d]"]) {
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        /* Force visibility for buttons that might be hidden - comprehensive rule */
        html:not(.dark) .yard-escalation-modal-container button:not(.yard-escalation-modal-submit-btn):not([class*="bg-white text-[#04356d]"]):not(.bg-\[#04356d\]):not(.bg-amber-600)[class*="bg-white/10"],
        html:not(.dark) .yard-escalation-modal-container button:not(.yard-escalation-modal-submit-btn):not([class*="bg-white text-[#04356d]"]):not(.bg-\[#04356d\]):not(.bg-amber-600)[class*="bg-white/20"] {
          color: #1a1a1a !important;
          background: rgba(219, 234, 254, 0.9) !important;
          border-color: rgba(59, 130, 246, 0.5) !important;
        }
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/20"]:disabled,
        html:not(.dark) .yard-escalation-modal-container button[class*="bg-white/20"][disabled] {
          color: #6b7280 !important;
          background: rgba(229, 231, 235, 0.7) !important;
        }
        html:not(.dark) .yard-escalation-modal-container header {
          background: rgba(240, 249, 255, 0.9) !important;
          border-bottom: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html.dark .yard-escalation-modal-container header {
          border-top-left-radius: 1rem !important;
          border-top-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-escalation-modal-container header h3 {
          color: #0f172a !important;
          font-weight: 700 !important;
        }
        html:not(.dark) .yard-escalation-modal-container header p {
          color: #475569 !important;
        }
        html:not(.dark) .yard-escalation-modal-container section p {
          color: #1a1a1a !important;
        }
        /* Input, select, textarea */
        html:not(.dark) .yard-escalation-modal-container input,
        html:not(.dark) .yard-escalation-modal-container select,
        html:not(.dark) .yard-escalation-modal-container textarea {
          background: #e0f2fe !important;
          border: 1.5px solid rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container input::placeholder,
        html:not(.dark) .yard-escalation-modal-container textarea::placeholder {
          color: #6b7280 !important;
        }
        html:not(.dark) .yard-escalation-modal-container input:focus,
        html:not(.dark) .yard-escalation-modal-container select:focus,
        html:not(.dark) .yard-escalation-modal-container textarea:focus {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15) !important;
          background: #ffffff !important;
          outline: none !important;
        }
        html:not(.dark) .yard-escalation-modal-container input:disabled,
        html:not(.dark) .yard-escalation-modal-container select:disabled,
        html:not(.dark) .yard-escalation-modal-container textarea:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        html:not(.dark) .yard-escalation-modal-container select option {
          background: #ffffff !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container select.bg-\[#2b2d68\] {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container select.bg-\[#2b2d68\]:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .yard-escalation-modal-container .bg-white\/5 {
          background: rgba(240, 249, 255, 0.4) !important;
          border-color: rgba(59, 130, 246, 0.2) !important;
        }
        /* Warning/Info text */
        html:not(.dark) .yard-escalation-modal-container .text-yellow-200 {
          color: #d97706 !important;
        }
        html:not(.dark) .yard-escalation-modal-container footer {
          border-top: 2px solid rgba(59, 130, 246, 0.3) !important;
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html.dark .yard-escalation-modal-container footer {
          border-bottom-left-radius: 1rem !important;
          border-bottom-right-radius: 1rem !important;
        }
        html:not(.dark) .yard-escalation-modal-close-btn {
          background: #dbeafe !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-close-btn:hover {
          background: #bfdbfe !important;
        }
        html:not(.dark) .yard-escalation-modal-submit-btn:hover:not(:disabled) {
          background: #1e3a8a !important;
        }
        html:not(.dark) .yard-escalation-modal-submit-btn:disabled {
          background: #e5e7eb !important;
          color: #9ca3af !important;
          border-color: #d1d5db !important;
        }
        /* File input text */
        html:not(.dark) .yard-escalation-modal-container input[type="file"] {
          color: #1a1a1a !important;
        }
        html:not(.dark) .yard-escalation-modal-container input[type="file"].text-white,
        html:not(.dark) .yard-escalation-modal-container input[type="file"].text-xs {
          color: #1a1a1a !important;
        }
        /* Placeholder text */
        html:not(.dark) .yard-escalation-modal-container textarea::placeholder,
        html:not(.dark) .yard-escalation-modal-container input::placeholder {
          color: #6b7280 !important;
        }
        html:not(.dark) .yard-escalation-modal-container .placeholder\:text-white\/40::placeholder {
          color: #6b7280 !important;
        }
      `}</style>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          onClick={() => (!saving && !sendingEmail ? onClose?.() : null)}
        />
        <div className="relative w-full max-w-4xl rounded-2xl border border-white/20 bg-white/10 text-white shadow-2xl backdrop-blur-xl yard-escalation-modal-container overflow-hidden dark:border-white/20 dark:bg-white/10 dark:text-white">
          <header className="flex items-center justify-between border-b border-white/20 px-6 py-4 rounded-t-2xl dark:border-white/20">
          <div>
            <h3 className="text-lg font-semibold">
              Manage Escalation (Yard {yardLabel})
            </h3>
            <p className="text-xs text-white/70">
              Update replacement or return workflows
            </p>
          </div>
          <button
            onClick={() => (!saving && !sendingEmail ? onClose?.() : null)}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 hover:bg-white/20 yard-escalation-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
          >
            ✕
          </button>
        </header>

        <div className="max-h-[72vh] overflow-y-auto px-6 py-5 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm text-white/80">Escalation Process</label>
              <select
                value={state.escalationProcess}
                onChange={handleChange("escalationProcess")}
                className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 text-sm outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
              >
                <option value="">Select process</option>
                <option value="Replacement">Replacement</option>
                <option value="Return">Return</option>
                <option value="Junk">Junk</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/80">Escalation Reason</label>
              <select
                value={state.escalationCause}
                onChange={handleChange("escalationCause")}
                className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 text-sm outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
              >
                <option value="">Choose cause</option>
                {ESC_CAUSES.map((cause) => (
                  <option key={cause} value={cause}>
                    {cause}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isReplacement && (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-white/15 bg-white/5 p-4">
                <h4 className="mb-3 text-base font-semibold text-white">
                  Part from Customer
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-white/80">Reason</label>
                    <select
                      value={state.custReason}
                      onChange={handleChange("custReason")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                    >
                      <option value="">Choose</option>
                      <option value="Junked">Junked</option>
                      <option value="Return">Return</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/80">Ship To</label>
                    <textarea
                      value={state.shipToReplacement}
                      onChange={handleChange("shipToReplacement")}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none placeholder:text-white/40 dark:bg-white/10 dark:border-white/30 dark:text-white"
                      placeholder="Enter replacement ship-to address"
                      disabled={disableReplacementCustomerFields}
                    />
                  </div>
                  <div>
                    <label className="block text-white/80">Shipping Method</label>
                    <select
                      value={state.customerShippingMethodReplacement}
                      onChange={handleChange("customerShippingMethodReplacement")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                      disabled={disableReplacementCustomerFields}
                    >
                      <option value="">Choose method</option>
                      {SHIPPING_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                  {state.customerShippingMethodReplacement === "Own shipping" && (
                    <div>
                      <label className="block text-white/80">Own Shipping Value ($)</label>
                      <input
                        value={state.custOwnShipReplacement}
                        onChange={handleChange("custOwnShipReplacement")}
                        className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                        placeholder="Enter amount"
                        disabled={disableReplacementCustomerFields}
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-white/80">Shipper</label>
                    <select
                      value={state.customerShipperReplacement}
                      onChange={handleChange("customerShipperReplacement")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                      disabled={disableReplacementCustomerFields}
                    >
                      <option value="">Choose shipper</option>
                      {SHIPPERS.map((shipper) => (
                        <option key={shipper} value={shipper}>
                          {shipper}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/80">Tracking No</label>
                    <input
                      value={state.customerTrackingNumberReplacement}
                      onChange={handleChange("customerTrackingNumberReplacement")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                      disabled={disableReplacementCustomerFields}
                    />
                  </div>
                  <div>
                    <label className="block text-white/80">ETA</label>
                    <input
                      type="date"
                      value={state.customerETAReplacement}
                      onChange={handleChange("customerETAReplacement")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                      disabled={disableReplacementCustomerFields}
                    />
                  </div>
                  <div>
                    <label className="block text-white/80">Delivery Status</label>
                    <select
                      value={state.custreplacementDelivery}
                      onChange={handleChange("custreplacementDelivery")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                      disabled={disableReplacementCustomerFields}
                    >
                      <option value="">Choose status</option>
                      {SHIPPING_STATUS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-white/15 bg-white/5 p-4">
                <h4 className="mb-3 text-base font-semibold text-white">
                  Part from Yard
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-white/80">Shipping Status</label>
                    <select
                      value={state.yardShippingStatus}
                      onChange={handleChange("yardShippingStatus")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                    >
                      <option value="">Choose status</option>
                      {SHIPPING_STATUS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/80">Shipping Method</label>
                    <select
                      value={state.yardShippingMethod}
                      onChange={handleChange("yardShippingMethod")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                    >
                      <option value="">Choose method</option>
                      {SHIPPING_METHODS.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </div>
                  {state.yardShippingMethod === "Own shipping" && (
                    <div>
                      <label className="block text-white/80">Own Shipping Value ($)</label>
                      <input
                        value={state.yardOwnShipping}
                        onChange={handleChange("yardOwnShipping")}
                        className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                        placeholder="Enter amount"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-white/80">Shipper</label>
                    <select
                      value={state.yardShipper}
                      onChange={handleChange("yardShipper")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                    >
                      <option value="">Choose shipper</option>
                      {SHIPPERS.map((shipper) => (
                        <option key={shipper} value={shipper}>
                          {shipper}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-white/80">Tracking No</label>
                    <input
                      value={state.yardTrackingNumber}
                      onChange={handleChange("yardTrackingNumber")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-white/80">ETA</label>
                    <input
                      type="date"
                      value={state.yardTrackingETA}
                      onChange={handleChange("yardTrackingETA")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-white/80">Tracking Link</label>
                    <input
                      type="url"
                      value={state.yardTrackingLink}
                      onChange={handleChange("yardTrackingLink")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                      placeholder="https://"
                    />
                  </div>
                </div>
              </section>
              <section className="lg:col-span-2 rounded-xl border border-white/15 bg-white/5 p-4 space-y-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] items-end">
                  <div>
                    <label className="block text-white/80">Send Email For</label>
                    <select
                      value={replacementEmailTarget}
                      onChange={(e) => setReplacementEmailTarget(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 text-sm outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                    >
                      <option value="Part from Customer">Part from Customer</option>
                      <option value="Part from Yard">Part from Yard</option>
                    </select>
                  </div>
                  {replacementEmailTarget !== "Part from Yard" && (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setShowReplacementFileInput((prev) => !prev)
                        }
                        disabled={disableReplacementCustomerFields}
                        className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                      >
                        Attach Document Link
                      </button>
                      {showReplacementFileInput && (
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(e) =>
                            setReplacementFile(e.target.files?.[0] || null)
                          }
                          className="text-xs text-white"
                        />
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleReplacementSendEmail}
                    disabled={sendingEmail || disableCustomerEmailActions}
                    className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                      sendingEmail || disableCustomerEmailActions
                        ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                        : "border-white/30 bg-white text-[#04356d] hover:bg-white/90 hover:scale-[1.02] shadow-md"
                    }`}
                  >
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canVoidReplacementCustomer && (
                    <button
                      type="button"
                      onClick={() => handleVoidReplacement("customer")}
                      disabled={actionLoading}
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                        actionLoading
                          ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                          : "border-white/30 bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      Void Label (Part from Customer)
                    </button>
                  )}
                  {canVoidReplacementYard && (
                    <button
                      type="button"
                      onClick={() => handleVoidReplacement("yard")}
                      disabled={actionLoading}
                      className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                        actionLoading
                          ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                          : "border-white/30 bg-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      Void Label (Part from Yard)
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}

          {isReturn && (
            <section className="rounded-xl border border-white/15 bg-white/5 p-4">
              <h4 className="mb-3 text-base font-semibold text-white">
                Return from Customer
              </h4>
              <div className="grid gap-4 md:grid-cols-2 text-sm">
                <div>
                  <label className="block text-white/80">Ship To</label>
                  <textarea
                    value={state.shipToReturn}
                    onChange={handleChange("shipToReturn")}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white outline-none placeholder:text-white/40"
                    placeholder="Enter return address"
                  />
                </div>
                <div>
                  <label className="block text-white/80">Shipping Method</label>
                  <select
                    value={state.customerShippingMethodReturn}
                    onChange={handleChange("customerShippingMethodReturn")}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                  >
                    <option value="">Choose method</option>
                    {SHIPPING_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                {state.customerShippingMethodReturn === "Own shipping" && (
                  <div>
                    <label className="block text-white/80">Own Shipping Value ($)</label>
                    <input
                      value={state.custOwnShippingReturn}
                      onChange={handleChange("custOwnShippingReturn")}
                      className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none dark:bg-white/10 dark:border-white/30 dark:text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-white/80">Shipper</label>
                  <select
                    value={state.customerShipperReturn}
                    onChange={handleChange("customerShipperReturn")}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                  >
                    <option value="">Choose shipper</option>
                    {SHIPPERS.map((shipper) => (
                      <option key={shipper} value={shipper}>
                        {shipper}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/80">Return Tracking No</label>
                  <input
                    value={state.returnTrackingCust}
                    onChange={handleChange("returnTrackingCust")}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/80">Return ETA</label>
                  <input
                    type="date"
                    value={state.custretPartETA}
                    onChange={handleChange("custretPartETA")}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-white/10 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-white/80">Delivery Status</label>
                  <select
                    value={state.custReturnDelivery}
                    onChange={handleChange("custReturnDelivery")}
                    className="mt-1 w-full rounded-lg border border-white/30 bg-[#2b2d68] px-3 py-2 outline-none transition hover:bg-[#090c6c] dark:bg-[#2b2d68] dark:hover:bg-[#090c6c] dark:text-white"
                  >
                    <option value="">Choose status</option>
                    {SHIPPING_STATUS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setShowReturnFileInput((prev) => !prev)}
                    className="rounded-md border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Attach Document Link
                  </button>
                  {showReturnFileInput && (
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => setReturnFile(e.target.files?.[0] || null)}
                      className="text-xs text-white"
                    />
                  )}
                  {returnRequiresAttachment && !returnFile && (
                    <p className="text-xs text-yellow-200">
                      Attachment required when shipping method is Own shipping.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleReturnSendEmail}
                  disabled={returnEmailDisabled}
                  className={`rounded-md border px-4 py-2 text-sm font-semibold transition ${
                    returnEmailDisabled
                      ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                      : "border-white/30 bg-white text-[#04356d] hover:bg-white/90 hover:scale-[1.02] shadow-md"
                  }`}
                >
                  {sendingEmail ? "Sending..." : "Send Email"}
                </button>
                {canVoidReturn && (
                  <button
                    type="button"
                    onClick={handleVoidReturn}
                    disabled={actionLoading}
                    className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
                      actionLoading
                        ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                        : "border-white/30 bg-white/10 text-white hover:bg-white/20"
                    }`}
                  >
                    Void Label
                  </button>
                )}
              </div>
            </section>
          )}

          {state.escalationProcess === "Junk" && (
            <section className="rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
              <p>
                Mark the escalation notes with additional context under “Support Comments”
                if required. No extra fields are needed for junk flow.
              </p>
            </section>
          )}
        </div>
        <footer className="flex justify-end gap-3 border-t border-white/20 bg-white/5 px-6 py-4 text-sm rounded-b-2xl dark:border-white/20">
          <button
            type="button"
            onClick={() => (!saving && !sendingEmail ? onClose?.() : null)}
            className="rounded-md border border-white/25 bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20 yard-escalation-modal-close-btn dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/20 dark:text-white"
            disabled={saving || sendingEmail}
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || sendingEmail}
            className={`rounded-md border px-4 py-2 font-semibold transition yard-escalation-modal-submit-btn ${
              saving || sendingEmail
                ? "cursor-not-allowed border-white/30 bg-white/20 text-white/70"
                : "border-white/30 bg-white text-[#04356d] hover:bg-white/90 hover:scale-[1.02] shadow-md dark:bg-white dark:text-[#04356d] dark:hover:bg-white/90"
            }`}
          >
            {saving ? "Saving..." : "Save Escalation"}
          </button>
        </footer>
        {pendingConfirmation && (
          <div className="absolute bottom-4 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-300/70 bg-amber-100/90 px-6 py-3 text-sm font-semibold text-amber-900 shadow-lg">
            <span>
              Send email for {pendingConfirmation.label}? Click Confirm to proceed or Cancel to abort.
            </span>
            <button
              onClick={async () => {
                try {
                  await pendingConfirmation.onConfirm?.();
                } finally {
                  setPendingConfirmation(null);
                  setToastPersistent(false);
                }
              }}
              className="rounded-md bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
            >
              Confirm
            </button>
            <button
              onClick={() => {
                setPendingConfirmation(null);
                setToastPersistent(false);
                setToast("Email send canceled.");
              }}
              className="rounded-md border border-amber-600 px-3 py-1 text-amber-700 hover:bg-amber-200"
            >
              Cancel
            </button>
          </div>
        )}
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-[200] flex -translate-x-1/2 items-center gap-4 rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-black shadow-lg">
            <span>{toast}</span>
            {!toastPersistent && (
              <button
                onClick={() => {
                  setToast("");
                  setToastPersistent(false);
                }}
                className="rounded-md bg-[#04356d] px-3 py-1 text-sm font-semibold text-white transition hover:bg-[#021f4b]"
              >
                OK
              </button>
            )}
            {toastPersistent && (
              <button
                onClick={() => {
                  setToast("");
                  setToastPersistent(false);
                }}
                className="rounded-md border border-[#04356d] px-3 py-1 text-sm font-semibold text-[#04356d] transition hover:bg-[#04356d]/10"
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}

