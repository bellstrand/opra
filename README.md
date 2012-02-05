### What

One Page to Rule them All


### Eh.. what?

Provides functions for serving and building html-files for single page applications.

Handles such tedious things as concatenating, compressing and compiling files before putting them into the html file.

Supports coffeescript and less out of the box.


### How

    var opra = require('opra');

    // express mumbo-jumbo here...

    app.use(opra.serve(__dirname + '/public', { inline: true }));