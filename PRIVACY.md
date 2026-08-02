# Privacy Policy — GIF Sender for WhatsApp

**Last updated:** 2 August 2026

GIF Sender for WhatsApp ("the extension") is a Chrome extension that converts
animated image files and short video clips into a format WhatsApp Web plays as a
looping GIF, and places the result into WhatsApp Web's own preview drawer so
that you can review it and send it yourself.

This policy describes what data the extension accesses, how that data is used
and handled, and who it is shared with.

---

## Summary

The extension does not collect, store, transmit, sell, or share any user data.
It has no servers, no accounts, no analytics, and no tracking of any kind, and
it makes no network requests of its own. Everything it does happens locally, in
your browser, on your computer.

---

## What the extension accesses

### Files you choose

When you select a file through the extension's panel, or drag a file onto the
WhatsApp Web page, the extension reads that file so that it can convert it.

The file is read into your browser's memory and converted there, using video
encoding features built into Chrome itself. The converted result is passed to
WhatsApp Web's preview drawer, where you decide whether to send it. The
extension does not upload the file, copy it elsewhere, retain it after
conversion, or transmit it to the developer or to any third party. Nothing is
written to disk, and nothing persists once the page is closed or reloaded.

When you drag a file from another website rather than from your own computer,
your browser supplies that file's contents to the page as part of the drag
operation. The extension reads what the browser hands it. It does not fetch the
file itself and makes no request to the website the file came from.

### The WhatsApp Web page

The extension runs on `https://web.whatsapp.com` only. It does not run on any
other website.

On that page, it displays its own button and panel, watches for files dragged
onto the window, and hands converted files to WhatsApp's preview drawer. To
attach a file to the correct conversation, it identifies which conversation is
currently open on screen.

The extension does not read, record, store, or transmit the contents of your
messages, your chat history, your contact list, your phone number, your profile,
or your account credentials. It does not send messages on your behalf: converted
files are staged in WhatsApp's own preview drawer, with WhatsApp's own send
button, and no message is sent unless you press it.

### Your clipboard

The extension does not read from or write to your system clipboard. Where a file
is handed to WhatsApp's message box, this is done by constructing an event
internally within the page; your actual clipboard contents are never accessed
and never modified.

---

## What data the extension collects

None. Specifically, the extension does not collect, and has no capability to
collect:

- personally identifiable information, such as your name, email address, or phone number
- your personal communications, including the contents of your WhatsApp messages
- authentication information, credentials, or session tokens
- financial or payment information
- health information
- your location
- your web browsing activity or browsing history
- user activity such as clicks, scrolls, keystrokes, or feature usage analytics
- the contents, names, or metadata of the files you convert

## How data is used

The only data the extension handles is the file you explicitly give it, and that
file is used for exactly one purpose: converting it into a format WhatsApp Web
can play, at your request. It is not used for any other purpose, and it is
discarded once conversion is complete.

## How data is shared

The extension shares data with no one. There are no third parties involved: no
analytics providers, no advertising networks, no data brokers, no cloud
conversion services, and no developer-operated servers. No data is sold or
transferred to anyone under any circumstances.

## Limited Use

The use of information received from Google APIs will adhere to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use),
including the Limited Use requirements.

Because the extension collects and transmits no user data, no data is
transferred to third parties, used for personalised advertising, sold to
advertising platforms or information resellers, used to determine
credit-worthiness or for lending purposes, or made available for any person to
read.

## Network activity

The extension makes no network requests. It does not contact the developer or
any other server, at install time, at run time, or at any other point. It
contains no analytics, telemetry, error reporting, update checks, or remote
configuration.

All of the extension's logic is contained within the extension package. It does
not download, fetch, or execute any code from a remote source.

## Data storage and retention

The extension stores nothing. It does not use browser storage, extension
storage, cookies, or any database. Files exist only in memory for the few
seconds a conversion takes and are released afterwards. Because nothing is
stored, there is nothing to retain, export, or delete.

## Permissions

The extension requests no Chrome permissions. It runs a content script scoped to
`https://web.whatsapp.com` and uses no browser APIs beyond retrieving a file
from within its own package. It requests no access to tabs, browsing history,
cookies, downloads, storage, or any site other than WhatsApp Web.

## Security

Because no data leaves your computer, there is no transmission of user data to
secure. Conversion is performed by Chrome's own built-in video encoding
features, running in your browser's sandbox.

## Children's privacy

The extension is not directed at children, and collects no data from any user,
including children.

## Changes to this policy

If this policy changes, the updated version will be published at this URL and
the date shown at the top will be revised.