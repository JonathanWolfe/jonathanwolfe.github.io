var fs = require( 'fs' );
var cssnext = require( 'cssnext' );
var uncss = require( 'uncss' );

var files = [ 'index.html' ];
var options = {
	stylesheets: [
		'https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.6/css/bootstrap.min.css',
		'css/main.css'
	],
	ignoreSheets: [ /fonts\.googleapis/gi, /ocitcons/gi, /compiled/gi ]
};

uncss( files, options, function ( error, uncssOutput ) {
	if ( error ) throw error;

	var cssnextOutput = cssnext( uncssOutput );
	var fontsReset = cssnextOutput.replace( /\.\.\/fonts\//gi, 'https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.6/fonts/' );

	fs.writeFileSync( 'css/compiled.css', fontsReset )
} );
