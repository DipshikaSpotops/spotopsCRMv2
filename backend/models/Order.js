import mongoose from 'mongoose';

const additionalInfoSchema = new mongoose.Schema({
yardName: String,
agentName: String,
yardRating:String,
phone: String,
altNo: String,
ext: Number,
email: String,
city: String,
state: String,
street: String,
zipcode: String,
expShipDate: String,
address: String,
country:String,
partPrice: Number,
shippingDetails: String,
others: String,
status: String,
paymentStatus: String,
cardChargedDate: Date,
refundStatus:String,
refundedAmount: Number,
storeCredit: Number,
storeCreditUsedFor: [
  {
    orderNo: String,  // The order from which the credit is being used
    amount: Number,    // The amount of credit being used
  },
],
refundedDate:Date,
collectRefundCheckbox: String,
upsClaimCheckbox: String,
storeCreditCheckbox: String,
refundToCollect: Number,
refundReason: String,
trackingNo: [String],
faxNo: String,
eta: String,
shipperName: String,
trackingLink:String,
escalationCause: String,
escalationProcess: String,
notes: [String],
poSentDate: String,
escalationDate: String,
labelCreationDate: [String],
partShippedDate: String,
poCancelledDate: String,
deliveredDate: String,
escTicked:String,
partDeliveredDate:String,
stockNo: String,
warranty: Number,
// for replacement__part from customer
custReason: String,
customerShippingMethodReplacement: String,
customerShipperReplacement: String,
customerTrackingNumberReplacement: String,
customerETAReplacement: String,
custOwnShipReplacement: String,
inTransitpartCustDate: String,
custreplacementDelivery: String,
repPartCustDeliveredDate: String,
// part from yard
yardShippingStatus: String,
yardShippingMethod: String,
yardShipper: String,
yardTrackingNumber: String,
yardOwnShipping: String,
yardTrackingETA: String,
yardTrackingLink: String,
inTransitpartYardDate: String,
yardDeliveredDate: String,
// yardDeliveryStatus: String,
// return__part from customer
customerShippingMethodReturn: String,
custretPartETA: String,
customerShipperReturn: String,
custOwnShippingReturn: String,
returnTrackingCust: String,
custReturnDelivery: String,
inTransitReturnDate:String,
returnDeliveredDate: String,
// reimburesement part
reimbursementAmount: String,
isReimbursedChecked: String,
custShipToRet: String,
custShipToRep: String,
// for voiding labels
trackingHistory: [String],
etaHistory:  [String],
shipperNameHistory: [String],
trackingLinkHistory: [String],
// screenshot for voided shipping label (stored as data URL or image URL)
voidLabelScreenshot: String,
// saving dates for bol in escalation
escRetTrackingDate: String,
escRepCustTrackingDate: String,
escRepYardTrackingDate: String,
// for voiding labels in esc popup(return)
escReturnTrackingHistory: [String],
escReturnETAHistory: [String],
escReturnShipperNameHistory: [String],
escReturnBOLhistory: [String],
// rep in esc
escRepTrackingHistoryCust: [String],
escRepETAHistoryCust: [String],
escRepShipperNameHistoryCust: [String],
escrepBOLhistoryCust: [String],
escRepTrackingHistoryYard: [String],
escRepETAHistoryYard: [String],
escRepShipperNameHistoryYard: [String],
escrepBOLhistoryYard: [String],
refundReason: String,
},
{strict:false}
);
const Yard = mongoose.model('Yard', additionalInfoSchema);
const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});
const orderSchema = new mongoose.Schema({
orderNo: { type: String, unique: true },
orderDate: { type: Date, required: true },
fName: String,
lName: String,
salesAgent: String,
customerName: String,
customerApprovedDate: String,
bAddressStreet: String,
bAddressCity: String,
bAddressState: String,
bAddressZip: String,
bAddressAcountry: String,
bName: String,
paymentSource: String,
authorizationId: String,
sAddressStreet: String,
sAddressCity: String,
sAddressState: String,
sAddressZip: String,
sAddressAcountry: String,
bAddress: String,
sAddress: String,
attention: String,
email: String,
phone: String,
altPhone: String,
make: String,
model: String,
year: Number,
pReq: String,
  desc: String,
  warranty: Number,
  warrantyField: String,
soldP: Number,
chargedAmount: Number,
costP: Number,
shippingFee: Number,
salestax: Number,
spMinusTax: String,
grossProfit: Number,
businessName:String,
orderStatus: String,
vin: String,
partNo: String,
last4digits: String,
additionalInfo: [additionalInfoSchema],
trackingInfo: String,
orderHistory: [String],
notes: [String],
isCancelled: { type: Boolean, default: false },
teamOrder:String,
actualGP:Number,
supportNotes:[String],
disputedDate: Date ,  
disputeReason: String,
custRefAmount: String,
custRefundDate: Date,
custRefundedAmount: Number,
cancelledDate: Date,
mainOrderDeliveredDate: String,
cancelledRefAmount: Number,
  cancellationReason:String,
  reimbursementAmount: {
    type: Number,
    default: null,
  },
  reimbursementDate: {
    type: Date,
  },
expediteShipping: String, 
dsCall: String,
programmingRequired: String,
programmingCostQuoted: String,
images: [imageSchema],
});

// Database synchronization hooks
// Sync to backup database after save
orderSchema.post('save', async function(doc) {
  try {
    // Dynamic import to avoid circular dependencies
    const { syncOrderToBackup } = await import('../services/dbSync.js');
    await syncOrderToBackup(doc, 'save');
  } catch (error) {
    // Silently fail - don't break main operations
    // Error is already logged in syncOrderToBackup
  }
});

// Sync to backup database after findOneAndUpdate
// Note: findOneAndUpdate hook receives the result document, not the query
orderSchema.post('findOneAndUpdate', async function(result) {
  if (result) {
    try {
      const { syncOrderToBackup } = await import('../services/dbSync.js');
      await syncOrderToBackup(result, 'save');
    } catch (error) {
      // Silently fail - don't break main operations
    }
  }
});

// Sync to backup database after findOneAndDelete
orderSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    try {
      const { syncOrderToBackup } = await import('../services/dbSync.js');
      await syncOrderToBackup(doc, 'delete');
    } catch (error) {
      // Silently fail - don't break main operations
    }
  }
});

export default mongoose.model("Order", orderSchema);