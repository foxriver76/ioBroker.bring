![Logo](/admin/bring.png)
# ioBroker.bring
===========================

![Build Status](https://github.com/foxriver76/ioBroker.bring/workflows/Test%20and%20Release/badge.svg)
![Number of Installations](http://iobroker.live/badges/bring-installed.svg) ![Stable version](http://iobroker.live/badges/bring-stable.svg) [![NPM version](http://img.shields.io/npm/v/iobroker.bring.svg)](https://www.npmjs.com/package/iobroker.bring)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bring.svg)](https://www.npmjs.com/package/iobroker.bring)

[![NPM](https://nodei.co/npm/iobroker.bring.png?downloads=true)](https://nodei.co/npm/iobroker.bring/)

## Disclaimer
The developers of this module are in no way endorsed by or affiliated with
Bring! Labs AG, or any associated subsidiaries, logos or trademarks.

## States
For a description of the created states, see below.

### Channel: info
* info.connection

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |boolean|R|

   *Read-only boolean indicator. If your broker is logged in on bring, the state is true otherwise false.*
   
* info.user

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only string. Contains the name of the logged-in user.*
   
### Shopping lists
For every shopping list a channel with the following states will be created:

* *list*.content / *list*.contentHtml/NoHead

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json/html string formatted as a list or html table. Contains the items which are currently on your shopping list.
   The NoHead Html tables are w/o table headers. The content is translated via the dictionary to allow usage in visualization adapters.*
   
* *list*.recentContent / *list*.recentContentHtml/NoHead

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json/html string formatted as a list or html table. Contains the items which were recently on your shopping list.
   The NoHead Html tables are w/o table headers. The content is translated via the dictionary to allow usage in visualization adapters.*
   
* *list*.removeItem/Translated

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be removed from the shopping list and recent content list. 
   The state will be acknowledged when the command is acknowledged by the Bring! API. 
   Note, that the translated states are using the dictionary before interacting with the API.*

   
   
* *list*.moveToRecentContent/Translated

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be moved or added to recent content list. 
   The state will be acknowledged when the command is acknowledged by the Bring! API.
   Note, that the translated states are using the dictionary before interacting with the API.* 
   
* *list*.saveItem/Translated

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be added to the shopping list. You can also specify additional information of the
   item, by setting the state by the following schema:* 
   
   ```Apple, 2.50 $, the green ones```
   
   *Note, that everything behind the comma describes the specification. 
   The state will be acknowledged when the command is acknowledged by the Bring! API.
   Note, that the translated states are using the dictionary before interacting with the API.*
    
* *list*.users / *list*.usersHtml/NoHead

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json/html string formatted as a list or html table. Contains the users which are part of the shopping list, 
   as well as their email address.
   The NoHead Html tables are w/o table headers.*
   
* *list*.count

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |number|R|

   *Read only number, which represents the number of contained items of the list.*
   
* *list*.messageTrigger

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |button|R/W|
    
    *If you press this button, the shopping list will be sent to the configured instances, e. g. Pushover, Telegram 
    or/and E-Mail.*
    
* *list*.enumSentence

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|
    
    *Read only string, which contains an enumeration of the shopping list items in a speakable form.
    This can be used e. g. for voice output via smart assistants.*
    
* *list*.translation

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|
    
    *Read only json string, which contains a dictionary to translate the swiss item names to the list language.*

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 1.9.1 (2025-01-21)
* (@foxriver76) fixed issue on token expiration

### 1.9.0 (2024-11-27)
* (@foxriver76) updated `bring-shopping` module (get rid of deprecated `request` module)
* (@foxriver76) dropped support for Node.js 16 (it is EOL)

### 1.8.4 (2023-09-25)
* (foxriver76) fixed setting `undefined` state when no name specified

### 1.8.3 (2023-09-25)
* (foxriver76) Improve error messages

### 1.8.2 (2023-09-24)
* (foxriver76) do not crash on invalid `setState` calls (closes #211)

### 1.8.1 (2022-06-01)
* (foxriver76) implemented a minor fix for acknowledgment of `translated` objects

### 1.8.0 (2022-06-01)
* (foxriver76) introduced new states for `save/remove/movetoRecentContent` which translates the article before passing it to the API (closes #149)

### 1.7.16 (2022-05-31)
* (foxriver76) we now ensure that all states which can be used directly are translated (closes #149)

### 1.7.15 (2022-05-26)
* (foxriver76) widget: fixed `margin-top` calculation of item name

### 1.7.14 (2022-05-22)
* (foxriver76) log the error message instead of object, if we catch errors in the widget

### 1.7.13 (2022-02-05)
* (foxriver76) fixed the onclick handler if someone added just a number

### 1.7.12 (2022-02-05)
* (foxriver76) fixed infinity loop in some browsers, if the fallback image of an article cannot be recevied (closes #109)

### 1.7.11 (2022-01-21)
* (foxriver76) fixed telegram user selection

### 1.7.9 (2021-12-07)
* (foxriver76) we fixed default value of `count` state beeing an empty string

### 1.7.8 (2021-08-04)
* (foxriver76) widget: fix blue border on input text field in Safari when focussing

### 1.7.7 (2020-12-12)
* (foxriver76) fix potential crash on `pollAllLists` function

### 1.7.6 (2020-12-05)
* (foxriver76) we now use a unique name for widget rendering function to avoid conflicts
* (foxriver76) if we cannot render widget immediately we try again after one second (see #57)

### 1.7.4 (2020-12-04)
* (foxriver76) we now render the widget immediately

### 1.7.3 (2020-10-26)
* (foxriver76) bring module now returns real errors instead of strings, handle them correct

### 1.7.2 (2020-04-23)
* (foxriver76) fixed potential issue on rendering widget

### 1.7.1 (2020-02-13)
* (foxriver76) we are now using AES-256-CBC as encryption

### 1.6.8 (2019-12-31)
* (foxriver76) ensure compatibility with older browsers

### 1.6.6 (2019-11-21)
* (foxriver76) improved error handling in widget

### 1.6.5 (2019-09-22)
* (foxriver76) re-auth when bearer token is no longer valid

### 1.6.3 (2019-08-28)
* (foxriver76) fixed bug which only allowed one registered event handler
* (foxriver76) by using obj with wid instead of var because vis handles global variables of widgets global
* (foxriver76) now more bring widgets can be used in one vis project
* (foxriver76) bump version of textFit to 2.3.1 -> 2.4.0 and use minified version

### 1.6.2 (2019-08-04)
* (foxriver76) also use translations for enumSentence and notifiations (e. g. email)

### 1.6.1 (2019-07-13)
* (foxriver76) fixed bug, that prevent html states and other from being set

### 1.6.0 (2019-07-12)
* (foxriver76) get translations according to list language
* (foxriver76) translations will be stored in datapoint
* (foxriver76) use bring-node-api at least 1.2.1
* (foxriver76) widget now uses configured language
* (foxriver76) bugfixes and optimizations in front- and backend

### 1.4.0 (2019-06-07)
* (foxriver76) use textFit to fit text to one line in widget
* (foxriver76) internal reworks on widget

### 1.3.4
* (foxriver76) add possibility to use this widget multiple times on same page

### 1.3.3
* (foxriver76) also change height and div sizes according to users specification
* (foxriver76) when item is on recent list and added by text input it is now instantly removed from recent list

### 1.3.2
* (foxriver76) enable configuration of width for items in widget

### 1.3.1
* (foxriver76) api module outsourced

### 1.3.0
* (foxriver76) added widget
* (foxriver76) add possibility to move items to recentContent

### 1.2.1
* (foxriver76) uri encode login request because it can contain special character

### 1.2.0
* (foxriver76) added state which contains a speakable enumeration of each shopping list

### 1.1.0
* (foxriver76) add possibility to send messages
* (foxriver76) respect in app list renaming / recreate channel on name change

### 1.0.0
* (foxriver76) stable release

### 0.0.10
* (foxriver76) set info.connection state to false, when cannot get data

### 0.0.9
* (foxriver76) also update no head states on normal polling
* (foxriver76) fix bug where polling could grow exponentially
* (foxriver76) fix unhandled error when no internet connection

### 0.0.8
* (foxriver76) add html states w/o header
* (foxriver76) minor fixes

### 0.0.7
* (foxriver76) fixed a potential memory leak by setTimeout functions

### 0.0.6
* (foxriver76) add equivalent html states for json states
* (foxriver76) add counter for every list

### 0.0.4
* (foxriver76) fix when login fails

### 0.0.3
* (foxriver76) initial release

## License
The MIT License (MIT)

Copyright (c) 2019-2025 Moritz Heusinger <moritz.heusinger@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
