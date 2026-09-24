export const TRUST_PAGES = {
  shipping: {
    eyebrow:'The trust desk / delivery',
    title:'On the way.',
    accent:'With a plan.',
    intro:'Tracked delivery, clear hand-offs and a live quote before you pay. The checkout estimate is always the final word for your destination.',
    image:'/assets/hero-tunnel.webp',
    imageAlt:'A football player walking through a lit stadium tunnel before a match.',
    facts:[['US standard','5–8 business days'],['Express option','2–4 business days'],['Free threshold','$100+ in the US'],['Tracking','Sent at carrier hand-off']],
    sections:[
      {heading:'Quote first. Promise second.',body:'Shipping is calculated from the destination, order contents and selected speed. Checkout shows the live delivery charge, tax treatment and estimated window before payment is confirmed.',list:['Standard tracked delivery is the default option where available.','Express delivery is shown only when the destination and current production queue support it.','The order confirmation keeps the destination and selected method attached to the order.']},
      {heading:'How the clock works',body:'The delivery window starts after the order is confirmed. Standard pieces move into preparation first; personalized pieces enter production after the artwork direction has been reviewed.',list:['Payment provider confirmation creates the order.','The studio reviews personalization before production begins.','Tracking appears in the order status page after the carrier accepts the parcel.']},
      {heading:'Current destinations',body:'The launch checkout currently supports the United States, Canada, United Kingdom, Australia, Singapore, Vietnam, Germany, France and Japan. Availability, taxes and rates can change by destination.',list:['If your country is not shown, do not pay through a different route.','Use the private tracking link for order questions; the order token keeps details out of public URLs.']}
    ],
    faqs:[['What is the free-shipping threshold?','US orders over $100 qualify for free standard shipping. The checkout quote confirms eligibility after the address and cart are validated.'],['Can I change my address?','Send the request before the order is handed to the carrier. After hand-off, the carrier rules control any redirect or address correction.'],['Do personalized pieces take longer?','They can. Artwork is reviewed before production, and checkout or the order status page is the source of truth for the current estimate.']]
  },
  returns: {
    eyebrow:'The trust desk / returns',
    title:'No surprises.',
    accent:'Just the right fit.',
    intro:'We want the piece to feel right when it arrives. This page separates standard returns, defects and personalized work so the next step is clear.',
    image:'/assets/jersey-oxblood.webp',
    imageAlt:'Oxblood Extra Time football jersey hanging against a dark studio background.',
    facts:[['Standard pieces','30-day return window'],['Condition','Unused, unworn, unwashed'],['Personalized work','Review before production'],['Defects','Contact us promptly']],
    sections:[
      {heading:'Standard pieces',body:'Eligible standard pieces can be returned within 30 days of delivery when they are unused, unworn and in original condition. The item must be packaged safely so it can travel back without damage.',list:['Start from the order status page and keep the order number ready.','Return shipping and any refund timing are confirmed during the return review.','Refunds go back through the original payment provider after inspection.']},
      {heading:'Personalized work',body:'Names, numbers, photos and other approved artwork are made for one order. Review the artwork direction carefully before approval; once production begins, a change-of-mind return may not be available.',list:['Spelling and sizing are the customer’s responsibility after approval.','A production issue, wrong item or transit damage is handled separately from a change-of-mind return.','Do not send a replacement or second payment before the studio confirms the next step.']},
      {heading:'Damage or wrong item',body:'Photograph the package and piece as soon as you notice an issue. Keep the packaging until the review is complete; it helps the studio and carrier investigate the hand-off.',list:['Use the private order link so the correct order record is attached.','Include the order number, a short description and clear photos of the issue.']}
    ],
    faqs:[['When does the 30-day window start?','The window starts on the delivery date recorded by the carrier. If a parcel is split, each item is considered from its own delivery date.'],['Are sale items returnable?','The checkout and order record show any item-specific restriction before payment. If no restriction is shown, the standard eligibility rules apply.'],['Can I return a personalized jersey?','A change-of-mind return may not be available once artwork has been approved and production has started. Defects and studio errors are still reviewed.']]
  },
  warranty: {
    eyebrow:'The trust desk / warranty',
    title:'Made to last.',
    accent:'Reviewed with care.',
    intro:'If a piece arrives with a manufacturing defect or a studio mistake, we want a clear path to review it. This page explains what to document, what is normally covered and what happens next.',
    image:'/assets/jersey-black.webp',
    imageAlt:'Black Extra Time football jersey photographed in a high-contrast studio.',
    facts:[['Coverage','Manufacturing and studio errors'],['Timing','Report promptly after delivery'],['Care','Follow the care label'],['Outcome','Repair, replacement or refund review']],
    sections:[
      {heading:'What this covers',body:'We review problems that appear to come from production or fulfilment: damaged construction, print or embroidery defects, a wrong item, or an item missing from the shipment. This review is separate from a change-of-mind return.',list:['Keep the item and packaging while the review is open.','Photographs of the full piece and the affected area help the studio compare the order record.','If the studio made the error, we will explain the available remedy before asking you to send anything back.']},
      {heading:'What is usually not a defect',body:'Normal wear, accidental damage, changes caused by washing outside the care instructions, a fit choice or customer-supplied artwork approved before production may not qualify as a manufacturing defect.',list:['Check the care and fit guidance before washing or altering a piece.','Do not repair, customise or discard an item before the review is complete.','A personalized piece can still be reviewed for a studio or manufacturing error even when change-of-mind returns are unavailable.']},
      {heading:'How to start a review',body:'Open the private order status link and keep the order number ready. Describe what changed, when you noticed it and whether the packaging was damaged in transit.',list:['Attach clear photos without payment details or unrelated personal information.','Use the private order route so the request is matched to the correct product, size and production record.','The studio may ask for one additional image or a return inspection before confirming the outcome.']},
      {heading:'What happens next',body:'The team checks the order, payment and fulfilment record, then confirms whether the issue is a production defect, transit damage, wrong item or normal wear. Any repair, replacement or refund is agreed before the next step.',list:['Refunds use the original payment provider when a refund is the approved remedy.','Do not pay a second time or ship a replacement until the studio confirms the instruction.','Your consumer-law rights are not removed by this review process.']}
    ],
    faqs:[['Is there a separate warranty period?','The store currently publishes a defect review process rather than a separate fixed warranty term. Report a suspected production or fulfilment problem promptly after delivery so it can be assessed with the order record and applicable consumer law.'],['What evidence should I send?','Include the order number, a short description and clear photos of the full item, the issue and the packaging if it was damaged. Never include card numbers.'],['What if the carrier damaged the parcel?','Keep the packaging and photograph it before disposal. The studio will coordinate the review with the carrier and tell you whether the next step is a replacement, refund or additional inspection.']]
  },
  privacy: {
    eyebrow:'The trust desk / privacy',
    title:'Your details.',
    accent:'Handled with care.',
    intro:'The store needs a few details to make, charge and deliver an order. It should never need more than that to give you a good experience.',
    image:'/assets/editorial-player.webp',
    imageAlt:'Football player in an editorial studio portrait wearing an Extra Time jersey.',
    facts:[['Used for','Orders, delivery and support'],['Payments','Handled by the provider'],['References','Private to the order'],['Public media','Never without permission']],
    sections:[
      {heading:'What we collect',body:'Depending on the action, Extra Time may receive your name, email, delivery address, order details, selected size and personalization instructions. Optional reference images stay attached to the private request that needs them.',list:['Cart and session storage keeps the bag working on your device.','Order records keep the details needed for fulfillment, support and legal accounting.','Payment details are entered with the payment provider; the store does not keep full card numbers.']},
      {heading:'What we do with it',body:'We use information to validate a cart, prepare a quote, create an order, deliver it, prevent abuse and answer support requests. We do not turn customer references into public product media without permission.',list:['Operational providers receive only the information needed for their job.','Staff access is limited to the order and workflow context they need.','AI artwork directions are treated as private order inputs and reviewed before production.']},
      {heading:'Your choices',body:'You can ask to review or correct the details attached to an order. Some records must remain for fraud prevention, tax or accounting obligations; the team will explain any limit instead of silently ignoring the request.',list:['Email support@jersevo.com or use the private order link for an order-specific question.','Sign out on shared devices and do not upload someone else’s image without their permission.','The storefront supports Meta / Facebook Pixel conversion tracking to measure e-commerce purchases and match personalized product catalog views.','We will update this page when a material privacy practice changes.']},
      {heading:'Contact for privacy requests',body:'Jersevo operates the Extra Time storefront from Texas, United States. Privacy, correction and deletion requests can be sent to support@jersevo.com.',list:['Include the relevant order number, but never include a full payment card number.','We may need to verify that the request belongs to the customer or account concerned.','A verified mailing address will be added here when the business address is finalised.']}
    ],
    faqs:[['Does Extra Time sell customer data?','No. Customer order details and references are used to operate the store, not sold as an audience list.'],['How are reference images handled?','They remain private to the relevant customization request and are used to review the requested artwork direction.'],['How do I request a correction?','Use the order status link or account session and include the order number so the request can be matched safely.']]
  },
  terms: {
    eyebrow:'The trust desk / terms',
    title:'Read the fine print.',
    accent:'Then make it yours.',
    intro:'A clear purchase flow matters more than clever wording. These terms explain what happens from the first click to the final hand-off.',
    image:'/assets/jersey-black.webp',
    imageAlt:'Black Extra Time football jersey photographed in a high-contrast studio.',
    facts:[['Currency','USD at checkout'],['Order state','Pending until verified payment'],['Personalization','Approved before production'],['Affiliation','Independent fan apparel']],
    sections:[
      {heading:'The purchase contract',body:'Product information, available variants, price, taxes and shipping are shown before payment. An order is pending while the provider confirms payment; it becomes confirmed only after a verified provider response.',list:['A browser return alone is not proof of payment.','If stock, price or a provider response changes, the order may pause for review.','The order status page is the record to use when a payment result is unclear.']},
      {heading:'Personalization and content',body:'You confirm the spelling, number, size and artwork direction you submit. Do not upload content that you do not have permission to use, that impersonates another person or that infringes a team, league or creator’s rights.',list:['The studio may refuse or pause a request that is unlawful, unsafe or impossible to produce.','Artwork approval is a production checkpoint, not a promise that every requested mark is an official logo or affiliation.','Extra Time is independent fan apparel and is not an official team or league store.']},
      {heading:'Prices, availability and changes',body:'Small-batch products can sell out. We may correct an obvious listing error, retire a product or update a policy before a new order is placed. A material change to an existing confirmed order is handled with the customer rather than hidden in the interface.',list:['Taxes and shipping are calculated for the checkout destination.','The payment provider’s terms also apply to the payment step.','The published policy pages are part of the pre-purchase information set.']},
      {heading:'Business and support',body:'Jersevo operates the Extra Time storefront from Texas, United States. Questions about an order, these terms or a policy can be sent to support@jersevo.com.',list:['Extra Time is the storefront brand; Jersevo is the business name supplied for the operator.','Do not send payment card numbers or account passwords by email.','A verified mailing and return address is provided through the applicable support or return process when required.']}
    ],
    faqs:[['When is my order confirmed?','After the payment provider returns a verified result and the server records the order as paid. The browser’s success page is not enough on its own.'],['Can Extra Time use my custom design publicly?','Not by default. Customer references and order directions stay private unless you separately give permission for a case study or editorial feature.'],['Are team names and logos official?','No. Extra Time is an independent fan-apparel studio. Product pages should make that distinction clear.']]
  },
  accessibility: {
    eyebrow:'The trust desk / access',
    title:'Everyone gets in.',
    accent:'Every step matters.',
    intro:'The store is built for keyboard, touch and assistive technology. If a route or control blocks you, the issue belongs with us—not with you.',
    image:'/assets/jersey-white.webp',
    imageAlt:'White Extra Time football jersey shown clearly against a pale studio background.',
    facts:[['Keyboard','Visible focus and usable controls'],['Screen readers','Labels and meaningful headings'],['Motion','Reduced-motion friendly'],['Contrast','Text and controls checked']],
    sections:[
      {heading:'How the interface is built',body:'Navigation uses real buttons and links, headings follow the page structure and important product images include descriptive alternative text. Forms keep labels next to the fields they describe.',list:['The cart, checkout and order tracking flows can be reached without a pointer.','Focus is kept inside open dialogs and returned to the control that opened them.','Private account, checkout and order routes are excluded from public indexing.']},
      {heading:'Motion and media',body:'Motion supports an action rather than competing with the content. Decorative imagery is not the only way to understand a product or policy, and reduced-motion preferences are respected where the browser exposes them.',list:['Product images include an alt description or are marked decorative when they add no information.','Video controls remain native and are not required to complete a purchase.','Error and success states use text as well as colour.']},
      {heading:'If something is blocked',body:'Note the page URL, the action you were trying to complete and the device or assistive technology involved. Use the order status or account route when the issue concerns an existing purchase.',list:['Do not include payment card details in a support request.','A screenshot can help explain a visual issue, but it is optional.','We prioritise checkout, account access and order tracking barriers first.']}
    ],
    faqs:[['Can I shop without a mouse?','Yes. Header navigation, product options, the bag and checkout use keyboard-operable controls with visible focus states.'],['Are product photos described?','Published product and taxonomy images receive alt text from the catalogue or a safe fallback. Decorative marks are hidden from assistive technology.'],['How do I report a barrier?','Use the order status or account route for an existing purchase and include the page URL and action that failed.']]
  },
  journal: {
    eyebrow:'The journal / behind the drop',
    title:'The stories stay.',
    accent:'The shirts move on.',
    intro:'A small archive of the references, rituals and late-match details that shape each Extra Time release.',
    image:'/assets/editorial-player.webp',
    imageAlt:'Editorial portrait of a football player wearing a dark Extra Time jersey.',
    facts:[['Field notes','Design references'],['Drop archive','Past stories'],['Studio view','Material and fit'],['Next issue','When the next story is ready']],
    sections:[
      {heading:'The tunnel before the noise',body:'The first reference is always the moment before the match: the walk, the floodlights and the quiet confidence of a shirt that has not met the pitch yet.',list:['Explore the current drop for the pieces built from this season’s visual language.','The Vault keeps past stories visible without pretending they are still available.']},
      {heading:'Made for the game after the game',body:'Extra Time designs for the memory that stays after the final whistle. Names, numbers, colour and small references make a piece personal without turning it into a costume.',list:['Read the product story before choosing a standard or personalized version.','Use the size guide and care notes before adding a piece to the bag.']},
      {heading:'A living archive',body:'New entries will be published when there is a real story to tell. Until then, the shop, league pages and Vault are the most useful ways to explore the studio.',list:['Browse by league or team to find the collection route.','Join 90+ Club for early access to selected drops.']}
    ],
    faqs:[['How often is the journal updated?','When a real studio story is ready. The page will not pretend that a placeholder is a finished editorial.'],['Can I submit a story?','The studio is not accepting a public submission form yet. Keep an eye on the current drop and account updates for future releases.'],['Where can I find older releases?','The Vault keeps selected past drops as an archive; sold-out pieces are not represented as available inventory.']]
  }
}
