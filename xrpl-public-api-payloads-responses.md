# XRPL Public API --- Payloads et réponses

> Référence de travail basée sur la documentation officielle :\
> https://xrpl.org/docs/references/http-websocket-apis/public-api-methods\
> Documentation générale des formats :
> https://xrpl.org/docs/references/http-websocket-apis/api-conventions
>
> **Important :** les payloads et réponses ci-dessous sont des exemples
> minimaux illustratifs, pas des réponses capturées en direct. Les
> réponses réelles varient selon le ledger, le compte, les paramètres,
> la version d'API et le serveur (`rippled` ou Clio). Les valeurs entre
> `<...>` sont des placeholders à remplacer. Pour les champs requis et
> options exhaustifs, suivre la page officielle liée à chaque méthode.

## Formats de requête

### WebSocket

Les exemples de ce README utilisent principalement le format WebSocket :

``` json
{
  "id": 1,
  "command": "account_info",
  "account": "rEXAMPLE_ADDRESS",
  "api_version": 2
}
```

### JSON-RPC HTTP

Le même appel se fait en HTTP POST JSON-RPC. Exemple pour `account_info`
:

``` json
{
  "method": "account_info",
  "params": [
    {
      "account": "rEXAMPLE_ADDRESS",
      "api_version": 2
    }
  ]
}
```

L'enveloppe de réponse JSON-RPC contient normalement `result` (et
parfois `status` ou des métadonnées selon le serveur). WebSocket ajoute
généralement `id`, `type: "response"` et `status`.

## Comptes

### `account_channels`

**But :** canaux de paiement émis par un compte.\
**Payload**

``` json
{"id":1,"command":"account_channels","account":"rEXAMPLE_ADDRESS","destination_account":"rDESTINATION_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","channels":[{"account":"rEXAMPLE_ADDRESS","destination_account":"rDESTINATION_ADDRESS","amount":"1000000","balance":"0","channel_id":"<CHANNEL_ID>","settle_delay":60}],"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_channels

### `account_currencies`

**But :** devises que le compte peut envoyer ou recevoir.\
**Payload**

``` json
{"id":1,"command":"account_currencies","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger_index":<INDEX>,"receive_currencies":["USD"],"send_currencies":["USD"],"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_currencies

### `account_info`

**But :** solde XRP, séquence et paramètres principaux du compte.\
**Payload**

``` json
{"id":1,"command":"account_info","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account_data":{"Account":"rEXAMPLE_ADDRESS","Balance":"100000000","Sequence":1,"OwnerCount":0,"Flags":0},"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_info

### `account_lines`

**But :** trust lines et soldes de devises émises.\
**Payload**

``` json
{"id":1,"command":"account_lines","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","lines":[{"account":"rISSUER_ADDRESS","balance":"12.5","currency":"USD","limit":"100","limit_peer":"0","no_ripple":false,"no_ripple_peer":false,"quality_in":0,"quality_out":0}],"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_lines

### `account_nfts`

**But :** NFT détenus par un compte.\
**Payload**

``` json
{"id":1,"command":"account_nfts","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","account_nfts":[{"Flags":0,"Issuer":"rISSUER_ADDRESS","NFTokenID":"<NFTOKEN_ID>","NFTokenTaxon":0,"URI":"<HEX_URI>"}],"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_nfts

### `account_objects`

**But :** objets du ledger appartenant au compte.\
**Payload**

``` json
{"id":1,"command":"account_objects","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","account_objects":[{"LedgerEntryType":"SignerList","Owner":"rEXAMPLE_ADDRESS","SignerQuorum":2,"index":"<LEDGER_OBJECT_INDEX>"}],"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_objects

### `account_offers`

**But :** offres DEX ouvertes par un compte.\
**Payload**

``` json
{"id":1,"command":"account_offers","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","offers":[{"flags":0,"seq":10,"taker_gets":"1000000","taker_pays":{"currency":"USD","issuer":"rISSUER_ADDRESS","value":"2"}}],"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_offers

### `account_tx`

**But :** historique des transactions d'un compte.\
**Payload**

``` json
{"id":1,"command":"account_tx","account":"rEXAMPLE_ADDRESS","ledger_index_min":-1,"ledger_index_max":-1,"limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","transactions":[{"tx":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Destination":"rDESTINATION_ADDRESS","Amount":"1000","hash":"<TX_HASH>"},"validated":true}],"ledger_index_min":<MIN_INDEX>,"ledger_index_max":<MAX_INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/account_tx

### `gateway_balances`

**But :** montants de devises émises par un gateway.\
**Payload**

``` json
{"id":1,"command":"gateway_balances","account":"rEXAMPLE_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"account":"rEXAMPLE_ADDRESS","obligations":{"USD":"1000"},"assets":{},"balances":{},"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/gateway_balances

### `noripple_check`

**But :** recommandations pour les paramètres No Ripple / Default
Ripple.\
**Payload**

``` json
{"id":1,"command":"noripple_check","account":"rEXAMPLE_ADDRESS","role":"gateway","limit":10,"ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"problems":[],"transactions":[],"account":"rEXAMPLE_ADDRESS","ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/account-methods/noripple_check

## Ledger

### `ledger`

**But :** informations sur un ledger et éventuellement ses
transactions/états.\
**Payload**

``` json
{"id":1,"command":"ledger","ledger_index":"validated","transactions":true,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger":{"ledger_index":<INDEX>,"ledger_hash":"<LEDGER_HASH>","parent_hash":"<PARENT_HASH>","close_time":<TIME>,"transactions":[]},"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger

### `ledger_closed`

**But :** dernier ledger clôturé.\
**Payload**

``` json
{"id":1,"command":"ledger_closed","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger_hash":"<LEDGER_HASH>","ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger_closed

### `ledger_current`

**But :** index du ledger en cours de construction.\
**Payload**

``` json
{"id":1,"command":"ledger_current","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger_current_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger_current

### `ledger_data`

**But :** parcourir les entrées brutes du ledger.\
**Payload**

``` json
{"id":1,"command":"ledger_data","ledger_index":"validated","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger_hash":"<LEDGER_HASH>","ledger_index":<INDEX>,"state":[{"index":"<ENTRY_INDEX>","LedgerEntryType":"AccountRoot","Account":"rEXAMPLE_ADDRESS"}]}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger_data

### `ledger_entry`

**But :** récupérer une entrée spécifique du ledger.\
**Payload**

``` json
{"id":1,"command":"ledger_entry","account_root":"rEXAMPLE_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"index":"<ENTRY_INDEX>","node":{"LedgerEntryType":"AccountRoot","Account":"rEXAMPLE_ADDRESS","Balance":"100000000","Sequence":1},"ledger_index":<INDEX>,"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/ledger-methods/ledger_entry

## Transactions

### `submit`

**But :** soumettre une transaction déjà signée.\
**Payload**

``` json
{"id":1,"command":"submit","tx_blob":"<SIGNED_TRANSACTION_HEX>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"engine_result":"tesSUCCESS","engine_result_code":0,"engine_result_message":"The transaction was applied.","tx_blob":"<SIGNED_TRANSACTION_HEX>","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/submit

### `submit_multisigned`

**But :** soumettre une transaction multi-signée déjà sérialisée.\
**Payload**

``` json
{"id":1,"command":"submit_multisigned","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Destination":"rDESTINATION_ADDRESS","Amount":"1000","Fee":"30","Sequence":1,"SigningPubKey":"","Signers":[{"Signer":{"Account":"rSIGNER_ADDRESS","SigningPubKey":"<PUBLIC_KEY>","TxnSignature":"<SIGNATURE>"}}]},"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"engine_result":"tesSUCCESS","engine_result_code":0,"engine_result_message":"The transaction was applied.","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/submit_multisigned

### `transaction_entry`

**But :** transaction dans un ledger précis.\
**Payload**

``` json
{"id":1,"command":"transaction_entry","tx_hash":"<TX_HASH>","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","hash":"<TX_HASH>"},"metadata":{"TransactionResult":"tesSUCCESS"},"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/transaction_entry

### `tx`

**But :** rechercher une transaction par hash ou CTID.\
**Payload**

``` json
{"id":1,"command":"tx","transaction":"<TX_HASH>","binary":false,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"hash":"<TX_HASH>","validated":true,"ledger_index":<INDEX>,"meta":{"TransactionResult":"tesSUCCESS"},"tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Destination":"rDESTINATION_ADDRESS","Amount":"1000"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/tx

### `sign` --- accès restreint

**But :** signer côté serveur ; généralement admin-only, sauf
configuration explicite.\
**Payload**

``` json
{"id":1,"command":"sign","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Destination":"rDESTINATION_ADDRESS","Amount":"1000","Fee":"12","Sequence":1},"secret":"<SECRET>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"tx_blob":"<SIGNED_TRANSACTION_HEX>","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/sign

### `sign_for` --- accès restreint

**But :** ajouter une signature à une transaction multi-signée ;
généralement admin-only.\
**Payload**

``` json
{"id":1,"command":"sign_for","account":"rSIGNER_ADDRESS","tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Destination":"rDESTINATION_ADDRESS","Amount":"1000","Fee":"30","Sequence":1,"SigningPubKey":"","Signers":[]},"secret":"<SECRET>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"tx_json":{"TransactionType":"Payment","Account":"rEXAMPLE_ADDRESS","Signers":[{"Signer":{"Account":"rSIGNER_ADDRESS","SigningPubKey":"<PUBLIC_KEY>","TxnSignature":"<SIGNATURE>"}}]}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/transaction-methods/sign_for

## Chemins de paiement, DEX et NFT

### `amm_info`

**But :** état d'un Automated Market Maker.\
**Payload**

``` json
{"id":1,"command":"amm_info","asset":{"currency":"XRP"},"asset2":{"currency":"USD","issuer":"rISSUER_ADDRESS"},"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"amm":{"account":"rAMM_ADDRESS","amount":"1000000","amount2":{"currency":"USD","issuer":"rISSUER_ADDRESS","value":"100"},"lp_token":{"currency":"LP","issuer":"rAMM_ADDRESS","value":"10"},"trading_fee":500},"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/amm_info

### `book_offers`

**But :** offres d'un order book entre deux actifs.\
**Payload**

``` json
{"id":1,"command":"book_offers","taker_gets":{"currency":"XRP"},"taker_pays":{"currency":"USD","issuer":"rISSUER_ADDRESS"},"ledger_index":"validated","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"offers":[{"Account":"rMAKER_ADDRESS","BookDirectory":"<BOOK_DIRECTORY>","Flags":0,"Sequence":1,"TakerGets":"1000000","TakerPays":{"currency":"USD","issuer":"rISSUER_ADDRESS","value":"1"}}],"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/book_offers

### `deposit_authorized`

**But :** vérifier si un compte peut envoyer directement à un autre
compte.\
**Payload**

``` json
{"id":1,"command":"deposit_authorized","source_account":"rSOURCE_ADDRESS","destination_account":"rDESTINATION_ADDRESS","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"deposit_authorized":true,"destination_account":"rDESTINATION_ADDRESS","ledger_index":<INDEX>,"source_account":"rSOURCE_ADDRESS","validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/deposit_authorized

### `nft_buy_offers`

**But :** offres d'achat pour un NFT.\
**Payload**

``` json
{"id":1,"command":"nft_buy_offers","nft_id":"<NFTOKEN_ID>","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"nft_id":"<NFTOKEN_ID>","offers":[{"amount":"1000000","owner":"rBUYER_ADDRESS","nft_offer_index":"<OFFER_INDEX>","flags":0}],"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/nft_buy_offers

### `nft_sell_offers`

**But :** offres de vente pour un NFT.\
**Payload**

``` json
{"id":1,"command":"nft_sell_offers","nft_id":"<NFTOKEN_ID>","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"nft_id":"<NFTOKEN_ID>","offers":[{"amount":"1000000","owner":"rSELLER_ADDRESS","nft_offer_index":"<OFFER_INDEX>","flags":1}],"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/nft_sell_offers

### `path_find` --- WebSocket uniquement

**But :** trouver un chemin de paiement et recevoir des mises à jour.\
**Payload**

``` json
{"id":1,"command":"path_find","subcommand":"create","source_account":"rSOURCE_ADDRESS","destination_account":"rDESTINATION_ADDRESS","destination_amount":"1000000","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"alternatives":[{"paths_computed":[],"source_amount":"1000000"}],"destination_account":"rDESTINATION_ADDRESS","destination_amount":"1000000","source_account":"rSOURCE_ADDRESS"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/path_find

### `ripple_path_find`

**But :** trouver ponctuellement des chemins de paiement.\
**Payload**

``` json
{"id":1,"command":"ripple_path_find","source_account":"rSOURCE_ADDRESS","destination_account":"rDESTINATION_ADDRESS","destination_amount":"1000000","source_currencies":[{"currency":"XRP"}],"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"alternatives":[{"paths_computed":[],"source_amount":"1000000"}],"destination_account":"rDESTINATION_ADDRESS","destination_amount":"1000000","source_account":"rSOURCE_ADDRESS"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/path-and-order-book-methods/ripple_path_find

## Canaux de paiement

### `channel_verify`

**But :** vérifier une signature de réclamation de canal.\
**Payload**

``` json
{"id":1,"command":"channel_verify","channel_id":"<CHANNEL_ID>","amount":"1000","signature":"<SIGNATURE_HEX>","public_key":"<PUBLIC_KEY_HEX>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"signature_verified":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/payment-channel-methods/channel_verify

### `channel_authorize` --- accès restreint

**But :** signer une réclamation de paiement de canal ; généralement
admin-only.\
**Payload**

``` json
{"id":1,"command":"channel_authorize","channel_id":"<CHANNEL_ID>","amount":"1000","secret":"<SECRET>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"signature":"<SIGNATURE_HEX>"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/payment-channel-methods/channel_authorize

## Abonnements WebSocket

### `subscribe` --- WebSocket uniquement

**But :** s'abonner à des flux et recevoir des notifications
asynchrones.\
**Payload**

``` json
{"id":1,"command":"subscribe","streams":["ledger","transactions"],"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","type":"response","result":{}}
```

**Exemple de notification ultérieure**

``` json
{"type":"ledgerClosed","ledger_index":<INDEX>,"ledger_hash":"<LEDGER_HASH>","fee_base":10}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/subscription-methods/subscribe

### `unsubscribe` --- WebSocket uniquement

**But :** arrêter un abonnement.\
**Payload**

``` json
{"id":2,"command":"unsubscribe","streams":["ledger","transactions"],"api_version":2}
```

**Réponse indicative**

``` json
{"id":2,"status":"success","type":"response","result":{}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/subscription-methods/unsubscribe

## Informations serveur

### `fee`

**But :** estimation des frais de transaction.\
**Payload**

``` json
{"id":1,"command":"fee","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"current_ledger_size":"10","drops":{"base_fee":"10","median_fee":"5000","minimum_fee":"10","open_ledger_fee":"10"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/fee

### `feature`

**But :** état d'un amendment connu du serveur.\
**Payload**

``` json
{"id":1,"command":"feature","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"features":{"<AMENDMENT_ID>":{"name":"ExampleAmendment","enabled":true,"supported":true}}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/feature

### `manifest`

**But :** informations de manifeste d'un validateur.\
**Payload**

``` json
{"id":1,"command":"manifest","public_key":"<VALIDATOR_PUBLIC_KEY>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"requested":"<VALIDATOR_PUBLIC_KEY>","manifest":"<MANIFEST_HEX>","master_key":"<MASTER_PUBLIC_KEY>","signing_key":"<SIGNING_PUBLIC_KEY>"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/manifest

### `server_definitions`

**But :** types et champs du format binaire canonique.\
**Payload**

``` json
{"id":1,"command":"server_definitions","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"FIELDS":[["Generic",{"isSerialized":false}]],"TYPES":{"AccountID":1},"LEDGER_ENTRY_TYPES":{},"TRANSACTION_TYPES":{},"TRANSACTION_RESULTS":{}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_definitions

### `server_info` (`rippled`)

**But :** état du serveur en format lisible.\
**Payload**

``` json
{"id":1,"command":"server_info","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"info":{"build_version":"<VERSION>","complete_ledgers":"<RANGE>","server_state":"full","validated_ledger":{"seq":<INDEX>,"hash":"<LEDGER_HASH>","reserve_base_xrp":1,"reserve_inc_xrp":0.2}}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_info

### `server_state`

**But :** état du serveur en format machine.\
**Payload**

``` json
{"id":1,"command":"server_state","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"state":{"build_version":"<VERSION>","server_state":"full","validated_ledger":{"seq":<INDEX>,"reserve_base":"10000000","reserve_inc":"2000000"}}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/server-info-methods/server_state

## Clio

> Ces méthodes dépendent d'un endpoint Clio compatible. Les résultats
> peuvent différer d'un serveur `rippled`.

### `server_info` (Clio)

**Payload**

``` json
{"id":1,"command":"server_info","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"info":{"build_version":"<CLIO_VERSION>","complete_ledgers":"<RANGE>","server_state":"full"}}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/server_info

### `ledger` (Clio)

**Payload**

``` json
{"id":1,"command":"ledger","ledger_index":"validated","transactions":true,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"ledger":{"ledger_index":<INDEX>,"ledger_hash":"<LEDGER_HASH>","transactions":[]},"validated":true}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/ledger

### `nft_info`

**But :** informations sur un NFT.\
**Payload**

``` json
{"id":1,"command":"nft_info","nft_id":"<NFTOKEN_ID>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"nft_id":"<NFTOKEN_ID>","ledger_index":<INDEX>,"owner":"rOWNER_ADDRESS","is_burned":false,"flags":0}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/nft_info

### `nft_history`

**But :** historique de propriété/transferts d'un NFT.\
**Payload**

``` json
{"id":1,"command":"nft_history","nft_id":"<NFTOKEN_ID>","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"nft_id":"<NFTOKEN_ID>","transactions":[{"tx":{"TransactionType":"NFTokenCreateOffer","hash":"<TX_HASH>"},"validated":true}]}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/nft_history

### `nfts_by_issuer`

**But :** NFT émis par un compte.\
**Payload**

``` json
{"id":1,"command":"nfts_by_issuer","issuer":"rISSUER_ADDRESS","limit":10,"api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"issuer":"rISSUER_ADDRESS","nfts":[{"NFTokenID":"<NFTOKEN_ID>","NFTokenTaxon":0,"Flags":0}],"limit":10}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/clio-methods/nfts_by_issuer

## Utilitaires

### `ping`

**But :** vérifier la connectivité au serveur.\
**Payload**

``` json
{"id":1,"command":"ping","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/utility-methods/ping

### `random`

**But :** obtenir des octets aléatoires.\
**Payload**

``` json
{"id":1,"command":"random","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"random":"<HEX_RANDOM_BYTES>"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/utility-methods/random

### `json` --- CLI uniquement

**But :** passer une commande JSON à `xrpld` depuis la ligne de
commande. Ce n'est pas une méthode publique HTTP/WebSocket.\
**Commande**

``` bash
xrpld -q json ledger_closed '{}'
```

**Réponse indicative**

``` json
{"result":{"ledger_hash":"<LEDGER_HASH>","ledger_index":<INDEX>,"status":"success"}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/utility-methods/json

## Vaults

### `vault_info`

**But :** informations sur un vault XRPL (si pris en charge par le
serveur/amendments).\
**Payload**

``` json
{"id":1,"command":"vault_info","vault_id":"<VAULT_ID>","ledger_index":"validated","api_version":2}
```

**Réponse indicative**

``` json
{"id":1,"status":"success","result":{"vault":{"VaultID":"<VAULT_ID>","Assets":[],"Owner":"rOWNER_ADDRESS"},"ledger_index":<INDEX>}}
```

Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/vault-methods/vault_info

## Méthodes obsolètes

### `owner_info` --- dépréciée / retirée selon la version

Utiliser `account_objects` à la place. Vérifier la disponibilité sur le
serveur ciblé.\
Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/deprecated-methods/owner_info

### `tx_history` --- dépréciée / retirée selon la version

Utiliser `account_tx`, ou `ledger` avec `transactions: true`. Vérifier
la disponibilité sur le serveur ciblé.\
Docs :
https://xrpl.org/docs/references/http-websocket-apis/public-api-methods/deprecated-methods/tx_history

## Gestion des erreurs

Une erreur peut avoir une structure semblable à celle-ci (les champs
exacts dépendent du transport et de l'erreur) :

``` json
{
  "id": 1,
  "status": "error",
  "error": "actNotFound",
  "error_message": "Account not found."
}
```

Consulter la convention officielle :
https://xrpl.org/docs/references/http-websocket-apis/api-conventions

## Conseils pratiques

-   Remplacer tous les placeholders (`<...>`) par des valeurs valides.
-   Utiliser de préférence `ledger_index: "validated"` pour lire un état
    confirmé, sauf besoin précis d'un ledger historique ou courant.
-   Paginer les résultats volumineux avec `marker` lorsque la méthode le
    prend en charge.
-   Ne jamais utiliser un secret réel dans des exemples, logs, dépôts
    Git ou environnements non fiables. Les méthodes `sign`, `sign_for`
    et `channel_authorize` nécessitent une attention particulière ;
    privilégier la signature côté client.
-   Vérifier les paramètres obligatoires et la forme exacte de la
    réponse dans la page officielle de chaque méthode : les squelettes
    ci-dessus sont illustratifs et ne remplacent pas la référence à
    jour.
