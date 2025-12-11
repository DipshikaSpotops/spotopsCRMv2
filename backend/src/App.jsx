import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MainLayout from "./layouts/MainLayout";
import useAuthBootstrap from "./hooks/useAuthBootstrap";

// Lazy load pages for code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AddOrder = lazy(() => import("./pages/AddOrder"));
const PlacedOrders = lazy(() => import("./pages/PlacedOrders"));
const CustomerApproved = lazy(() => import("./pages/CustomerApproved"));
const MonthlyOrders = lazy(() => import("./pages/MonthlyOrders"));
const AllOrders = lazy(() => import("./pages/AllOrders"));
const YardProcessingOrders = lazy(() => import("./pages/YardProcessing"));
const InTransitOrders = lazy(() => import("./pages/InTransit"));
const CancelledOrders = lazy(() => import("./pages/CancelledOrders"));
const RefundedOrders = lazy(() => import("./pages/RefundedOrders"));
const DisputedOrders = lazy(() => import("./pages/DisputedOrders"));
const FulfilledOrders = lazy(() => import("./pages/FulfilledOrders"));
const OverallEscalationOrders = lazy(() => import("./pages/OverallEscalationOrders"));
const OngoingEscalationOrders = lazy(() => import("./pages/OngoingEscalations"));
const CreateUser = lazy(() => import("./pages/CreateUser"));
const ViewUsers = lazy(() => import("./pages/ViewUsers"));
const OrderDetails = lazy(() => import("./pages/OrderDetails"));
const CancelledRefundedOrders = lazy(() => import("./pages/CancelledRefundedReport"));
const CardNotCharged = lazy(() => import("./pages/CardNotCharged"));
const CollectRefund = lazy(() => import("./pages/CollectRefund"));
const DeliveryTimeReport = lazy(() => import("./pages/DeliveryReport"));
const MonthlyDisputes = lazy(() => import("./pages/MonthlyDisputes"));
const Purchases = lazy(() => import("./pages/Purchases"));
const POReport = lazy(() => import("./pages/POReport"));
const ShippingExpenses = lazy(() => import("./pages/ShippingExpenses"));
const StoreCredits = lazy(() => import("./pages/StoreCredit"));
const TrackingInfo = lazy(() => import("./pages/TrackingInfo"));
const SalesData = lazy(() => import("./pages/SalesData"));
const SalesReport = lazy(() => import("./pages/SalesReport"));

// Loading fallback component
const PageLoader = () => (
  <div className="h-screen flex items-center justify-center">
    <div className="text-white text-xl">Loading...</div>
  </div>
);

function App() {
  useAuthBootstrap(); // read localStorage and dispatch setCredentials once.
  return (
    <Router>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Pages with Sidebar + Navbar */}
        <Route
          path="/dashboard"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <Dashboard />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/add-order"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <AddOrder />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/placed-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <PlacedOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/customer-approved"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CustomerApproved />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/monthly-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <MonthlyOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/view-all-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <AllOrders />
              </Suspense>
            </MainLayout>
          }
        />
        {/* <Route
          path="/order-details"
          element={
              <OrderForm />
          }
        /> */}
        <Route
          path="/yard-processing"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <YardProcessingOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/in-transit"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <InTransitOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/cancelled-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CancelledOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/refunded-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <RefundedOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/disputed-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <DisputedOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/fulfilled-orders"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <FulfilledOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/overall-escalation"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <OverallEscalationOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/ongoing-escalation"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <OngoingEscalationOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/create-user"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CreateUser />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/view-users"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <ViewUsers />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/order-details"
          element={
            <Suspense fallback={<PageLoader />}>
              <OrderDetails />
            </Suspense>
          }
        />
        <Route
          path="/order-details/:orderNo"
          element={
            <Suspense fallback={<PageLoader />}>
              <OrderDetails />
            </Suspense>
          }
        />
        <Route
          path="/cancelled-refunded-report"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CancelledRefundedOrders />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/card-not-charged-report"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CardNotCharged />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/collect-refund"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <CollectRefund />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/delivery-time"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <DeliveryTimeReport />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/monthly-disputes"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <MonthlyDisputes />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/purchases"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <Purchases />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/po-report"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <POReport />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/shipping-expenses"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <ShippingExpenses />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/store-credit"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <StoreCredits />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/tracking-info"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <TrackingInfo />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/sales-data"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <SalesData />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/sales-report"
          element={
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
                <SalesReport />
              </Suspense>
            </MainLayout>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
