![Logo](/admin/bring.png)
# ioBroker.bring
===========================

[![Build Status Travis](https://travis-ci.org/foxriver76/ioBroker.bring.svg?branch=master)](https://travis-ci.org/foxriver76/ioBroker.bring)
[![Build status](https://ci.appveyor.com/api/projects/status/r7whpsbjfqn18toe/branch/master?svg=true)](https://ci.appveyor.com/project/foxriver76/iobroker-bring/branch/master)
[![NPM version](http://img.shields.io/npm/v/iobroker.bring.svg)](https://www.npmjs.com/package/iobroker.bring)
[![Downloads](https://img.shields.io/npm/dm/iobroker.bring.svg)](https://www.npmjs.com/package/iobroker.bring)
[![Greenkeeper badge](https://badges.greenkeeper.io/foxriver76/ioBroker.bring.svg)](https://greenkeeper.io/)

[![NPM](https://nodei.co/npm/iobroker.bring.png?downloads=true)](https://nodei.co/npm/iobroker.bring/)

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
   The NoHead Html tables are w/o table headers.*
   
* *list*.recentContent / *list*.recentContentHtml/NoHead

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json/html string formatted as a list or html table. Contains the items which were recently on your shopping list.
   The NoHead Html tables are w/o table headers.*
   
* *list*.removeItem

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be removed from the shopping list. 
   The state will be acknowledged when the command is acknowledged by the Bring! API.*
   
* *list*.saveItem

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be added to the shopping list. You can also specify additional information of the
   item, by setting the state by the following schema:* 
   
   ```Apple, 2.50 $, the green ones```
   
   *Note, that everything behind the comma describes the specification. 
   The state will be acknowledged when the command is acknowledged by the Bring! API.*
    
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

Copyright (c) 2019 Moritz Heusinger <moritz.heusinger@gmail.com>

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
