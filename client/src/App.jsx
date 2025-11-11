import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard"));
import MainLayout from "./layouts/MainLayout";
import RequireAuth from "./components/RequireAuth";
import AddOrder from "./pages/AddOrder";
import PlacedOrders from "./pages/PlacedOrders";
import CustomerApproved from "./pages/CustomerApproved";
import MonthlyOrders from "./pages/MonthlyOrders";
import AllOrders from "./pages/AllOrders";
import OrderForm  from "./pages/OrderDetails";
import YardProcessingOrders  from "./pages/YardProcessing";
import InTransitOrders from "./pages/InTransit";
import CancelledOrders from "./pages/CancelledOrders";
import RefundedOrders from "./pages/RefundedOrders";
import DisputedOrders from "./pages/DisputedOrders";
import FulfilledOrders from "./pages/FulfilledOrders";
import OverallEscalationOrders from "./pages/OverallEscalationOrders";
import OngoingEscalationOrders from "./pages/OngoingEscalations";
import CreateUser from "./pages/CreateUser";
import ViewUsers from "./pages/ViewUsers";
import OrderDetails from "./pages/OrderDetails";
import CancelledRefundedOrders from "./pages/CancelledRefundedReport";
import CardNotCharged from "./pages/CardNotCharged";
import CollectRefund from "./pages/CollectRefund";
import UPSClaims from "./pages/UPSClaims";
import DeliveryTimeReport from "./pages/DeliveryReport";
import MonthlyDisputes from "./pages/MonthlyDisputes";
import Purchases from "./pages/Purchases";
import POReport from "./pages/POReport";
import ShippingExpenses from "./pages/ShippingExpenses";
import StoreCredits from "./pages/StoreCredit";
import TrackingInfo from "./pages/TrackingInfo"
import useAuthBootstrap from "./hooks/useAuthBootstrap";
import SalesData from "./pages/SalesData";
import SalesReport from "./pages/SalesReport";

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
          element={withLayout(<AddOrder />)}
        />
        <Route
          path="/placed-orders"
          element={withLayout(<PlacedOrders />)}
        />
        <Route
          path="/customer-approved"
          element={withLayout(<CustomerApproved />)}
        />
        <Route
          path="/monthly-orders"
          element={withLayout(<MonthlyOrders />)}
        />
        <Route
          path="/view-all-orders"
          element={withLayout(<AllOrders />)}
        />
        {/* <Route
          path="/order-details"
          element={
              <OrderForm />
          }
        /> */}
        <Route
          path="/yard-processing"
          element={withLayout(<YardProcessingOrders />)}
        />
        <Route
          path="/in-transit"
          element={withLayout(<InTransitOrders />)}
        />
        <Route
          path="/cancelled-orders"
          element={withLayout(<CancelledOrders />)}
        />
        <Route
          path="/refunded-orders"
          element={withLayout(<RefundedOrders />)}
        />
        <Route
          path="/disputed-orders"
          element={withLayout(<DisputedOrders />)}
        />
        <Route
          path="/fulfilled-orders"
          element={withLayout(<FulfilledOrders />)}
        />
        <Route
          path="/overall-escalation"
          element={withLayout(<OverallEscalationOrders />)}
        />
        <Route
          path="/ongoing-escalation"
          element={withLayout(<OngoingEscalationOrders />)}
        />
        <Route          
        path="/create-user"
        element={withLayout(<CreateUser />)}
        />
        <Route
        path="/view-users"
        element={withLayout(<ViewUsers />)}
        />
          <Route
        path="/order-details"
        element={requireAuth(<OrderDetails />)}/>
        <Route path="/order-details/:orderNo" element={requireAuth(<OrderDetails />)} />
        <Route
        path="/cancelled-refunded-report"
        element={withLayout(<CancelledRefundedOrders />)}/>
        <Route
        path="/card-not-charged-report"
        element={withLayout(<CardNotCharged />)}/>
        <Route
        path="/collect-refund"
        element={withLayout(<CollectRefund />)}/>
        <Route
        path="/ups-claims"
        element={withLayout(<UPSClaims />)}/>
        <Route
        path="/delivery-time"
        element={withLayout(<DeliveryTimeReport />)}/>
        <Route
        path="/monthly-disputes"
        element={withLayout(<MonthlyDisputes />)}/>
        <Route
        path="/purchases"
        element={withLayout(<Purchases />)}/>
        <Route
        path="/po-report"
        element={withLayout(<POReport />)}/>
        <Route
        path="/shipping-expenses"
        element={withLayout(<ShippingExpenses />)}/>
        <Route
        path="/store-credit"
        element={withLayout(<StoreCredits />)}/>
        <Route
        path="/tracking-info"
        element={withLayout(<TrackingInfo />)}/>
        <Route
        path="/sales-data"
        element={withLayout(<SalesData />)}/>
        <Route
        path="/sales-report"
        element={withLayout(<SalesReport />)}
          />
      </Routes>
    </Router>
  );
}

export default App;
