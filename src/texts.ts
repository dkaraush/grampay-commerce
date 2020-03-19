const escapeHTML = (str : string) => str.replace(/\&/g, '&amp;').replace(/\</g, '&lt;').replace(/\>/g, '&gt;');
const _ = (from : string) => ((options? : any, format : boolean = true) => {
    let text = from;
    if (!options) return text;
    for (let optionKey in options) 
        text = text.replace(new RegExp('\\{'+optionKey+'\\}', 'g'), escapeHTML(options[optionKey]+""));
    return text;
});

const short_domain = 'grampay.org';
const domain = 'https://grampay.org';

export default {
    escapeHTML, domain,

    buyerLogin: _(`You have signed in to buy <b><a href=\"${domain}/product/{product_id}\">\"{product}\"</a></b> (<b>\${price_usd}</b> ≈ {price_grm} GRM). Make sure that it was you.`),
    openedOrderSeller: _(`<b>{buyer}</b> ordered to buy <b><a href=\"${domain}/product/{product_id}\">{product}</a></b> for <b>\${price_usd}</b> ({price_grm} GRM)
Check buyer's details and confirm or discard the order.

Link to the chat: <b><a href=\"${domain}/order/?{token}\">Order #{order_id}</a></b>`),
    openedOrderBuyer: _(`You have ordered <b><a href=\"${domain}/product/{product_id}\">{product}</a></b> from <b>{seller}</b> for <b>\${amount_usd}</b> ({amount_grm} GRM)

Link to the chat: <b><a href=\"${domain}/order/?{token}\">Order #{order_id}</a></b>`),
    
    welcome: _(`Welcome to Grampay - Accept payments in TON Gram. This bot allows you to create your very own shop and add your products.`),
    createShopButton: _('Create shop!'),
    alreadyHaveShop: _('Oops, you already have a shop. Type /shop to manage your advertisements.'),
    doesntHaveShop: _('Missing shop.'),
    
    askShopType: _('Please select the type of a product that you want to sell?'),
    badShopType: _('Please,choose a command in a keyboard menu.'),
    shopTypeDigitalButton: _('☁️ Digital Goods'),
    shopTypePhysicalButton: _('🍏 Physical Items'),

    askDescription: _(`Great! Write a description of your shop. From 2 to 512 symbols.`),
    badDescription: _('Oh, that is a bad description. There is a limit (2 to 512 symbols) '),

    askAddress: _(`Nice! The last step: give us an address to your Gram wallet.
<a href='https://wallet.ton.org/'>Link to the official Gram Wallet.</a>`),
    badAddress: _(`This doesn’t look like a valid wallet address.`),
    shopDone: _(`Your shop has been created at <b><a href="${domain}/shop/{link}">${short_domain}/shop/{link}</a></b>!
You are welcome to put some products in it by pressing <b>"🛒 Make an advertisement"</b>`),

    help: _(`/info shows shop and products info
/orders shows all your orders.
/orders_active shows only active orders.
/add_product adds product to your shop list
/cancel cancels current operation
/remove_{id} removes product from your shop list
/remove removes your shop`),

    info: _(`Your shop link: ${domain}/shop/{shop_link}

Products count: {products_count}
`),
    productInfo: _(`{i}. <code>#{id}</code> {title} (\${price}) /remove_{id}`),

    productWasNotFound: _("Product with ID {id} was not found."),
    productIsNotYours: _("Product with ID {id} doesn\'t belong to your shop."),
    productWasRemoved: _("Product was removed."),

    askProductTitle: _('Write your product\'s title:'),
    badProductTitle: _('Bad product title. Must be from 2 to 512 symbols.'),

    askProductImage: _(`Now send please an image of your product. It would be shown in a square shape.
File limit: 10MB.`),
    badProductImage: _('Oh, bad product image. Probably you haven\'t put a file or file was too big.'),
    badProductImagePhoto: _('Please, send an image as uncompressed document.'),
    badProductImageSize: _('Image is larger than 10MB.'),
    badProductImageError: _('Failed to download that image. Probably server error, please, contact @dkaraush.'),
    badProductImageType: _('Bad image type. I accept only JPEG and PNG.'),

    askProductPrice: _(`Write a price of your product in USD.`),
    badProductPrice: _('Price must start from 2 USD.'),

    productAdded: _(`Product <b>{title}</b> (\${price_usd} ≈ {price_grm} GRM) was added to your shop!`),

    chatNotification: _(`💬 <b>{from_name}</b> sent you: "{text}"

(<a href="${domain}/order/?{token}">Order #{order_id}</a>: {product_name})`),
    chatNotificationFile: _(`💬 <b>{from_name}</b> sent you a file: <b>{filename}</b> ({filesize})
(<a href="${domain}/order/?{token}">Order #{order_id}</a>: {product_name})`),
    cancelNotification: _(`<b>{from_name}</b> ({from_type}) cancelled <b><a href="${domain}/order/?{order_token}">Order #{order_id}</a></b>.`),
    confirmNotification: _(`<b>{from_name}</b> confirmed <b><a href="${domain}/order/?{order_token}">Order #{order_id}</a></b>.
You are welcome to pay the order.`),

    releaseNotification: _(`💸 <b>{from_name}</b> released {amount_grm} GRM to your wallet from <b><a href="${domain}/order?{order_token}">Order #{order_id}</a></b>.`),
    refundNotification:  _(`💸 <b>{from_name}</b> refunded back {amount_grm} GRM to your wallet from <b><a href="${domain}/order?{order_token}">Order #{order_id}</a></b>.`),

    youDisputed: _(`You opened dispute in <b><a href="${domain}/order?{order_token}">Order #{order_id}</a></b>.
Funds of the order are frozen and waiting for support decision.`),
    theyDisputed: _(`Dispute was opened in <b><a href="${domain}/order?{order_token}">Order #{order_id}</a></b>.
Funds of the order are frozen and waiting for support decision.`),

    payNotificationBuyer: _(`💸 Payment for <a href="${domain}/product/{product_id}"><b>"{product_name}"</b></a> has been completed successfully.

{product_name} — <b>\${product_price_usd}</b> ({product_price_grm} GRM)
GramPay Fee ({fee_percent}%) — <b>\${fee_usd}</b> ({fee_grm} GRM)
<b>Total — \${total_usd} ({total_grm} GRM)</b>

Link to the chat: <a href="${domain}/order/?{order_token}"><b>Order #{order_id}</b></a>

If there is no dispute and Gram has not been sent to the buyer, you will receive Gram back to your wallet automatically in <strike>7 days</strike> 4 hours (demo).`),
    payNotificationSeller: _(`💸 <b>{from_name}</b> paid <a href="${domain}/order/?{order_token}"><b>Order #{order_id}</b></a>!
Please note that you have <strike>7 days</strike> <b>4 hours</b> (demo) to fullfill the order. In case there is no confirmation from a buyer after the product has been sent, freeze the funds by opening a dispute.

Link to the chat: <a href="${domain}/order/?{order_token}"><b>Order #{order_id}</b></a>`),

    details: <any> {
        fname: "First name",
        lname: "Last name",
        address1: "Address Line 1",
        address2: "Address Line 2",
        country: "Country",
        city: "City",
        zip: "ZIP/Postal Code",
        phone: "Phone",
        email: "E-mail"
    },

    cancelled: _("Cancelled."),

    hasOpenOrders: _("Can't remove your shop: you have unfinished orders. Complete them first."),
    shopRemoved: _("Your shop was removed."),

    noOrders: _("No orders.")
    
};
