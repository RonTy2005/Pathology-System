const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const docxPath = path.resolve(__dirname, "../old app data in image form/sample report/cbc.docx");

mammoth.extractRawText({path: docxPath})
    .then(function(result){
        var text = result.value; // The raw text
        console.log("--- RAW TEXT ---");
        console.log(text.substring(0, 5000));
    })
    .catch(function(err) {
        console.error(err);
    });

mammoth.convertToHtml({path: docxPath})
    .then(function(result){
        var html = result.value;
        fs.writeFileSync(path.resolve(__dirname, "cbc.html"), html);
        console.log("Saved to cbc.html");
    })
    .catch(function(err) {
        console.error(err);
    });
