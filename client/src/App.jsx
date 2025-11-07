import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard"));
import MainLayout from "./layouts/MainLayout";
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
              <Suspense fallback={<div className="text-center p-8">Loading dashboard...</div>}>
                <Dashboard />
              </Suspense>
            </MainLayout>
          }
        />
        <Route
          path="/add-order"
          element={
            <MainLayout>
              <AddOrder />
            </MainLayout>
          }
        />
        <Route
          path="/placed-orders"
          element={
            <MainLayout>
              <PlacedOrders />
            </MainLayout>
          }
        />
        <Route
          path="/customer-approved"
          element={
            <MainLayout>
              <CustomerApproved />
            </MainLayout>
          }
        />
        <Route
          path="/monthly-orders"
          element={
            <MainLayout>
              <MonthlyOrders />
            </MainLayout>
          }
        />
        <Route
          path="/view-all-orders"
          element={
            <MainLayout>
              <AllOrders />
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
              <YardProcessingOrders />
              </MainLayout>
          }
        />
        <Route
          path="/in-transit"
          element={
               <MainLayout>
              <InTransitOrders />
              </MainLayout>
          }
        />
        <Route
          path="/cancelled-orders"
          element={
               <MainLayout>
              <CancelledOrders />
              </MainLayout>
          }
        />
        <Route
          path="/refunded-orders"
          element={
               <MainLayout>
              <RefundedOrders />
              </MainLayout>
          }
        />
        <Route
          path="/disputed-orders"
          element={
               <MainLayout>
              <DisputedOrders />
              </MainLayout>
          }
        />
        <Route
          path="/fulfilled-orders"
          element={
               <MainLayout>
              <FulfilledOrders />
              </MainLayout>
          }
        />
        <Route
          path="/overall-escalation"
          element={
               <MainLayout>
              <OverallEscalationOrders />
              </MainLayout>
          }
        />
        <Route
          path="/ongoing-escalation"
          element={
               <MainLayout>
              <OngoingEscalationOrders />
              </MainLayout>
          }
        />
        <Route          
        path="/create-user"
        element={
            <MainLayout>
              <CreateUser/>
            </MainLayout>
          }
        />
        <Route
        path="/view-users"
        element={
          <MainLayout>
            <ViewUsers/>
          </MainLayout>
        }
        />
          <Route
        path="/order-details"
        element={
            <OrderDetails />
        }/>
        <Route path="/order-details/:orderNo" element={<OrderDetails />} />
        <Route
        path="/cancelled-refunded-report"
        element={
          <MainLayout>
            <CancelledRefundedOrders/>
          </MainLayout>
        }/>
        <Route
        path="/card-not-charged-report"
        element={
          <MainLayout>
            <CardNotCharged />
          </MainLayout>
        }/>
        <Route
        path="/collect-refund"
        element={
          <MainLayout>
            <CollectRefund/>
          </MainLayout>
        }/>
        <Route
        path="/delivery-time"
        element={
          <MainLayout>
            <DeliveryTimeReport/>
          </MainLayout>
        }/>
        <Route
        path="/monthly-disputes"
        element={
          <MainLayout>
            <MonthlyDisputes/>
          </MainLayout>
        }/>
        <Route
        path="/purchases"
        element={
          <MainLayout>
            <Purchases/>
          </MainLayout>
        }/>
        <Route
        path="/po-report"
        element={
          <MainLayout>
            <POReport/>
          </MainLayout>
        }/>
        <Route
        path="/shipping-expenses"
        element={
          <MainLayout>
            <ShippingExpenses/>
          </MainLayout>
        }/>
        <Route
        path="/store-credit"
        element={
          <MainLayout>
            <StoreCredits/>
          </MainLayout>
        }/>
        <Route
        path="/tracking-info"
        element={
          <MainLayout>
            <TrackingInfo/>
          </MainLayout>
        }/>
        <Route
        path="/sales-data"
        element={
          <MainLayout>
            <SalesData/>
          </MainLayout>
        }/>
        <Route
        path="/sales-report"
        element={
          <MainLayout>
            <SalesReport/>
          </MainLayout>
        }
          />
      </Routes>
    </Router>
  );
}

export default App;
