// COPY AND PASTE THIS ENTIRE FILE INTO YOUR GOOGLE APPS SCRIPT EDITOR
// Go to Extensions > Apps Script in your Google Sheet
// Paste this, save, and hit Deploy > New Deployment > Web app (Anyone with link)

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);
  }
  
  var headers = data[0];
  var rows = data.slice(1);
  var result = rows.map(function(row) {
    var obj = {};
    headers.forEach(function(header, index) {
      obj[header] = row[index];
    });
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var payload = JSON.parse(e.postData.contents);
  
  if (payload.action === 'dedupe') {
    var range = sheet.getDataRange();
    // Google Sheets index is 1-based. We remove duplicates based on the Phone Number column (2)
    range.removeDuplicates([2]); 
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Duplicates removed" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (payload.action === 'delete' && payload.leads) {
    var data = sheet.getDataRange().getValues();
    var hds = data[0];
    var phoneIndex = hds.findIndex(function(h) { return String(h).toLowerCase().indexOf("phone") > -1; });
    var nameIndex = hds.findIndex(function(h) { return String(h).toLowerCase().indexOf("business") > -1 || String(h).toLowerCase().indexOf("name") > -1; });
    
    var phonesToDelete = payload.leads.map(function(l) { return l.phone_number; }).filter(Boolean);
    var namesToDelete = payload.leads.map(function(l) { return l.business_name; }).filter(Boolean);
    
    var deleted = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      var rowPhone = phoneIndex > -1 ? data[i][phoneIndex] : null;
      var rowName = nameIndex > -1 ? data[i][nameIndex] : null;
      
      if ((rowPhone && phonesToDelete.indexOf(rowPhone) > -1) || (rowName && namesToDelete.indexOf(rowName) > -1)) {
        sheet.deleteRow(i + 1);
        deleted++;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Deleted " + deleted + " rows" })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (payload.leads) {
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newRows = [];
    payload.leads.forEach(function(lead) {
      var row = [];
      headers.forEach(function(header) {
        var h = String(header).toLowerCase();
        if (h.indexOf("business") > -1 || h.indexOf("name") > -1) row.push(lead.business_name || "");
        else if (h.indexOf("phone") > -1) row.push(lead.phone_number || "");
        else if (h.indexOf("website") > -1) row.push(lead.website || "");
        else if (h.indexOf("address") > -1) row.push(lead.address || "");
        else if (h.indexOf("rating") > -1) row.push(lead.google_rating || "");
        else if (h.indexOf("review") > -1) row.push(lead.google_review_count || "");
        else if (h.indexOf("query") > -1) row.push(lead.search_query || "");
        else row.push("");
      });
      newRows.push(row);
    });
    
    if (newRows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ ok: true, added: newRows.length })).setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ error: "Invalid payload" })).setMimeType(ContentService.MimeType.JSON);
}
