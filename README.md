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

* <listname>.content

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json string formatted as a list. Contains the items which are currently on your shopping list.*
   
* <listname>.recentContent

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json string formatted as a list. Contains the items which was recently on your shopping list.*
   
* <listname>.removeItem

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R/W|

   *Select an item which should be removed from the shopping list. 
   The state will be acknowledged when the command is acknowledged by API.*
   
* <listname>.saveItem

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Select an item which should be added to the shopping list. 
   The state will be acknowledged when the command is acknowledged by API.*  
    
* <listname>.users

    |Data type|Permission|                                                                       
    |:---:|:---:|
    |string|R|

   *Read only json string formatted as a list. Contains the users which are part of the shopping list, 
   as well as their email address.*

### 0.0.1
* (foxriver76) initial release

## License
The MIT License (MIT)

Copyright (c) 2018 Moritz Heusinger <moritz.heusinger@gmail.com>

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
