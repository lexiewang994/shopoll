param(
  [int]$Port = 3000,
  [string]$ListenAddress = "127.0.0.1"
)

$env:PORT = [string]$Port
$env:NODE_ENV = "development"
$env:DEMO_MODE = "true"
$env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/shopoll"
$env:SHOPIFY_API_KEY = "shopoll_local_dev"
$env:SHOPIFY_API_SECRET = "shopoll_local_dev_secret_shopoll_local_dev_secret"
$env:SHOPIFY_APP_URL = "http://${ListenAddress}:$Port"
$env:SHOPIFY_SHOP_DOMAIN = "harbor-dev.myshopify.com"
$env:SHOP_CUSTOM_DOMAIN = "shop.harborinno.com"
$env:SCOPES = "read_products,read_orders,read_discounts,write_discounts,read_fulfillments,write_pixels,read_customer_events,write_app_proxy"

$npmCommand = (Get-Command npm.cmd).Source
& $npmCommand run dev:web -- --host $ListenAddress
