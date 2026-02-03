import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MainLayout from "./layouts/MainLayout";
import RequireAuth from "./components/RequireAuth";
import useAuthBootstrap from "./hooks/useAuthBootstrap";

// Lazy load all pages for code splitting
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AddOrder = lazy(() => import("./pages/AddOrder"));
const EditOrder = lazy(() => import("./pages/EditOrder"));
const PlacedOrders = lazy(() => import("./pages/PlacedOrders"));
const PartiallyChargedOrders = lazy(() => import("./pages/PartiallyChargedOrders"));
const CustomerApproved = lazy(() => import("./pages/CustomerApproved"));
const MonthlyOrders = lazy(() => import("./pages/MonthlyOrders"));
const AllOrders = lazy(() => import("./pages/AllOrders"));
const YardProcessingOrders = lazy(() => import("./pages/YardProcessing"));
const OwnShippingOrders = lazy(() => import("./pages/OwnShippingOrders"));
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
const UPSClaims = lazy(() => import("./pages/UPSClaims"));
const DeliveryTimeReport = lazy(() => import("./pages/DeliveryReport"));
const MonthlyDisputes = lazy(() => import("./pages/MonthlyDisputes"));
const Purchases = lazy(() => import("./pages/Purchases"));
const POReport = lazy(() => import("./pages/POReport"));
const ShippingExpenses = lazy(() => import("./pages/ShippingExpenses"));
const StoreCredits = lazy(() => import("./pages/StoreCredit"));
const TrackingInfo = lazy(() => import("./pages/TrackingInfo"));
const SalesData = lazy(() => import("./pages/SalesData"));
const SalesReport = lazy(() => import("./pages/SalesReport"));
const EmailLeads = lazy(() => import("./pages/EmailLeads"));
const Leads = lazy(() => import("./pages/Leads"));
const Yards = lazy(() => import("./pages/Yards"));
const ReimbursementReport = lazy(() => import("./pages/ReimbursementReport"));

// Loading fallback component
const PageLoader = () => (
  <div className="h-screen flex items-center justify-center">
    <div className="text-white text-xl">Loading...</div>
  </div>
);

function App() {
  useAuthBootstrap(); // read localStorage and dispatch setCredentials once.

  const withLayout = (node) => (
    <RequireAuth>
      <MainLayout>{node}</MainLayout>
    </RequireAuth>
  );

  const requireAuth = (node) => <RequireAuth>{node}</RequireAuth>;

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
            withLayout(
              <Suspense fallback={<div className="text-center p-8">Loading dashboard...</div>}>
                <Dashboard />
              </Suspense>
            )
          }
        />
        <Route
          path="/add-order"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <AddOrder />
            </Suspense>
          )}
        />
        <Route
          path="/edit-order"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <EditOrder />
            </Suspense>
          )}
        />
        <Route
          path="/placed-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <PlacedOrders />
            </Suspense>
          )}
        />
        <Route
          path="/partially-charged-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <PartiallyChargedOrders />
            </Suspense>
          )}
        />
        <Route
          path="/customer-approved"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CustomerApproved />
            </Suspense>
          )}
        />
        <Route
          path="/monthly-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <MonthlyOrders />
            </Suspense>
          )}
        />
        <Route
          path="/view-all-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <AllOrders />
            </Suspense>
          )}
        />
        <Route
          path="/yard-processing"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <YardProcessingOrders />
            </Suspense>
          )}
        />
        <Route
          path="/own-shipping-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <OwnShippingOrders />
            </Suspense>
          )}
        />
        <Route
          path="/in-transit"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <InTransitOrders />
            </Suspense>
          )}
        />
        <Route
          path="/cancelled-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CancelledOrders />
            </Suspense>
          )}
        />
        <Route
          path="/refunded-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <RefundedOrders />
            </Suspense>
          )}
        />
        <Route
          path="/disputed-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <DisputedOrders />
            </Suspense>
          )}
        />
        <Route
          path="/fulfilled-orders"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <FulfilledOrders />
            </Suspense>
          )}
        />
        <Route
          path="/overall-escalation"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <OverallEscalationOrders />
            </Suspense>
          )}
        />
        <Route
          path="/ongoing-escalation"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <OngoingEscalationOrders />
            </Suspense>
          )}
        />
        <Route          
        path="/create-user"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CreateUser />
            </Suspense>
          )}
        />
        <Route
        path="/view-users"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <ViewUsers />
            </Suspense>
          )}
        />
          <Route
        path="/order-details"
          element={requireAuth(
            <Suspense fallback={<PageLoader />}>
              <OrderDetails />
            </Suspense>
          )}
        />
        <Route
          path="/order-details/:orderNo"
          element={requireAuth(
            <Suspense fallback={<PageLoader />}>
              <OrderDetails />
            </Suspense>
          )}
        />
        <Route
        path="/cancelled-refunded-report"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CancelledRefundedOrders />
            </Suspense>
          )}
        />
        <Route
        path="/card-not-charged-report"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CardNotCharged />
            </Suspense>
          )}
        />
        <Route
        path="/collect-refund"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <CollectRefund />
            </Suspense>
          )}
        />
        <Route
        path="/ups-claims"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <UPSClaims />
            </Suspense>
          )}
        />
        <Route
        path="/delivery-time"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <DeliveryTimeReport />
            </Suspense>
          )}
        />
        <Route
        path="/monthly-disputes"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <MonthlyDisputes />
            </Suspense>
          )}
        />
        <Route
        path="/purchases"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <Purchases />
            </Suspense>
          )}
        />
        <Route
        path="/po-report"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <POReport />
            </Suspense>
          )}
        />
        <Route
        path="/shipping-expenses"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <ShippingExpenses />
            </Suspense>
          )}
        />
        <Route
        path="/store-credit"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <StoreCredits />
            </Suspense>
          )}
        />
        <Route
        path="/tracking-info"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <TrackingInfo />
            </Suspense>
          )}
        />
        <Route
        path="/sales-data"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <SalesData />
            </Suspense>
          )}
        />
        <Route
        path="/sales-report"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <SalesReport />
            </Suspense>
          )}
          />
        <Route
          path="/email-leads"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <EmailLeads />
            </Suspense>
          )}
        />
        <Route
          path="/leads"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <Leads />
            </Suspense>
          )}
        />
        <Route
          path="/yards"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <Yards />
            </Suspense>
          )}
        />
        <Route
          path="/reimbursement-report"
          element={withLayout(
            <Suspense fallback={<PageLoader />}>
              <ReimbursementReport />
            </Suspense>
          )}
        />
      </Routes>
    </Router>
  );
}

export default App;
