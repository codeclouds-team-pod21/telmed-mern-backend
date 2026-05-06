# Example Request Bodies

## Create Product

```json
{
  "name": "Semaglutide",
  "description": "Main product",
  "productCategory": "weight-loss",
  "productType": "glp1",
  "productClassification": "main",
  "displayPrice": 199,
  "genderAvailability": "both",
  "generalQuestion": 1,
  "medicalQuestion": 2,
  "swappableProductQuestionaries": 3,
  "keypoints": ["Weekly dose", "Doctor reviewed"],
  "restrictedState": ["AK", "HI"],
  "swappableProductIds": [12, 13],
  "blockMilitaryBases": true,
  "blockIslands": true,
  "status": true,
  "productVariants": [
    {
      "basic": {
        "variantName": "starter-pack",
        "description": "Starter",
        "sellingPrice": 199
      },
      "crm": {
        "name": "VRIO",
        "offer": 10,
        "shippingProfile": 1,
        "pharmacy": 1,
        "campaign": 2
      },
      "doctor": {
        "networkId": 1,
        "refills": 1,
        "quantity": 1,
        "daysSupply": 30,
        "dispenseUnit": 1,
        "offrableId": "OFR-1001",
        "prescriptionDuration": 30,
        "metaData": "{\"strength\":\"0.25mg\"}"
      },
      "isSupplyAvailable": true,
      "supplyProducts": [20],
      "isTitrationAvailable": true,
      "titrationProducts": [21]
    }
  ]
}
```

## Create Funnel

```json
{
  "funnelName": "Weight Loss Funnel",
  "slug": "weight-loss",
  "promoSlug": "alpha-v1",
  "funnelDescription": "Primary funnel",
  "shortDescription": "Short copy",
  "crm": 1,
  "campaign": 2,
  "renewalCampaign": 5,
  "swappableCampaign": 6,
  "displayDefault": 1,
  "redirectType": "soft",
  "funnelTemplate": "alpha-boost.alpha-v1",
  "funnelProducts": [
    {
      "productId": 10,
      "productVariantId": 100
    }
  ]
}
```

## Create Order

```json
{
  "body": {
    "email": "patient@example.com",
    "phone": "9999999999",
    "ship_fname": "Jane",
    "ship_lname": "Doe",
    "ship_address1": "123 Demo Street",
    "ship_city": "Austin",
    "ship_state": "TX",
    "ship_zipcode": "78701",
    "bill_fname": "Jane",
    "bill_lname": "Doe",
    "bill_address1": "123 Demo Street",
    "bill_city": "Austin",
    "bill_state": "TX",
    "bill_zipcode": "78701",
    "varient_id": 100
  },
  "mapping": {
    "crm_id": 1,
    "crm_type": "vrio",
    "funnel_id": 7,
    "product_id": 10,
    "crm_offer_id": 10
  }
}
```
