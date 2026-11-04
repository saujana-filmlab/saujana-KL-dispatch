const CSG_COLLATOR = new Intl.Collator(undefined, { numeric:true, sensitivity:"base" });
const CSG_ALLOWED = /\.(jpe?g|tiff?)$/i;
const CSG_LOGOS = {};

function csgFileName(file) {
  return file.webkitRelativePath || file.name || "";
}

function csgSupportedFile(file) {
  return CSG_ALLOWED.test(csgFileName(file)) || /image\/(jpeg|tiff|x-tiff)/i.test(file.type);
}

function csgIsTiffFile(file) {
  return /\.tiff?$/i.test(csgFileName(file)) || /image\/(tiff|x-tiff)/i.test(file.type);
}

function csgSortFiles(files) {
  return Array.from(files).filter(csgSupportedFile).sort((a,b)=>CSG_COLLATOR.compare(csgFileName(a),csgFileName(b)));
}

function csgReadDirectory(reader) {
  return new Promise((resolve,reject) => {
    const entries = [];
    const readBatch = () => reader.readEntries(batch => {
      if (!batch.length) { resolve(entries); return; }
      entries.push(...batch);
      readBatch();
    },reject);
    readBatch();
  });
}

function csgEntryFile(entry) {
  return new Promise((resolve,reject) => entry.file(resolve,reject));
}

async function csgFilesFromEntry(entry) {
  if (entry.isFile) return [await csgEntryFile(entry)];
  if (!entry.isDirectory) return [];
  const children = await csgReadDirectory(entry.createReader());
  const files = [];
  for (const child of children.sort((a,b)=>CSG_COLLATOR.compare(a.name,b.name))) {
    files.push(...await csgFilesFromEntry(child));
  }
  return files;
}

async function csgDroppedFolders(dataTransfer) {
  const entries = Array.from(dataTransfer.items || [])
    .map(item => typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null)
    .filter(Boolean);
  const folders = entries.filter(entry=>entry.isDirectory).sort((a,b)=>CSG_COLLATOR.compare(a.name,b.name));
  if (!folders.length) return [];
  const groups = [];
  for (const folder of folders) {
    groups.push({name:folder.name,files:csgSortFiles(await csgFilesFromEntry(folder))});
  }
  return groups;
}

function csgLoadImage(src) {
  const url = new URL(src, document.baseURI).href;
  if (CSG_LOGOS[url]) return CSG_LOGOS[url];
  CSG_LOGOS[url] = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      delete CSG_LOGOS[url];
      reject(new Error(`Required contact-sheet logo could not load: ${src}`));
    };
    image.src = url;
  });
  return CSG_LOGOS[url];
}

let CSG_BRAND_READY = null;

function csgLoadBrandAssets() {
  if (!CSG_BRAND_READY) {
    CSG_BRAND_READY = Promise.all([
      csgLoadImage("saujana-logo.png")
    ]).catch(error => {
      CSG_BRAND_READY = null;
      throw error;
    });
  }
  return CSG_BRAND_READY;
}

// Load mandatory branding while staff completes the order form, before scans are prepared.
csgLoadBrandAssets().catch(()=>{});

function csgGrid(count, output, format) {
  if (format === "full") {
    if (count === 24) return output === "delivery" ? [6,4] : [3,8];
    if (count === 36) return output === "delivery" ? [6,6] : [4,9];
    if (count === 37) return output === "delivery" ? [6,7] : [4,10];
  }
  if (format === "half" && count === 72) return output === "delivery" ? [12,6] : [8,9];

  const target = output === "delivery" ? (format === "full" ? 6 : 12) : (format === "full" ? 4 : 8);
  let best = [Math.min(target, count), Math.ceil(count / Math.min(target, count))];
  let bestScore = Infinity;
  const limit = Math.min(format === "half" ? 14 : 10, count);
  for (let columns = 1; columns <= limit; columns += 1) {
    const rows = Math.ceil(count / columns);
    const empty = columns * rows - count;
    const score = Math.abs(columns - target) * .22 + empty / Math.max(1, count);
    if (score < bestScore) { best = [columns, rows]; bestScore = score; }
  }
  return best;
}

function csgContained(ctx, image, x, y, width, height) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function csgRebate(ctx, x, y, width, height, frame, showNumber, compact) {
  ctx.fillStyle = "#d58d22";
  const tickWidth = compact ? 1.2 : 1.7;
  const tickGap = compact ? 4 : 6;
  const tickArea = Math.min(width * .34, compact ? 30 : 62);
  for (let offset = 0; offset < tickArea; offset += tickGap) {
    const tall = Math.round(offset / tickGap) % 3 === 0;
    ctx.fillRect(x + offset, y + (tall ? 3 : 6), tickWidth, Math.max(2, height - (tall ? 7 : 11)));
  }
  if (showNumber) {
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";
    ctx.font = compact ? "700 7px Arial" : "700 10px Arial";
    ctx.fillText(String(frame).padStart(2,"0"), x + width - 2, y + height / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }
}

async function csgRender(canvas, frames, output, format, numbered, filmName, customerName, renderTag) {
  const width = output === "delivery" ? 1600 : 1080;
  const height = output === "delivery" ? 1200 : 1920;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha:false, colorSpace:"srgb" });
  ctx.fillStyle = "#070707"; ctx.fillRect(0,0,width,height);

  const margin = output === "delivery" ? 54 : 38;
  // Instagram places the poster identity over the upper-left of Stories.
  // Reserve that area and start the exported Story artwork below it.
  const header = output === "delivery" ? 132 : 260;
  const footer = output === "delivery" ? 46 : 72;
  const gapX = output === "delivery" ? 10 : 8;
  const gapY = 9;
  const rebate = output === "delivery" ? 22 : 20;
  const [columns, rows] = csgGrid(frames.length, output, format);
  const usableWidth = width - margin * 2;
  const areaHeight = height - header - footer;
  const cellWidth = (usableWidth - gapX * (columns - 1)) / columns;
  const maxHeight = (areaHeight - gapY * (rows - 1)) / rows;
  const aspect = format === "full" ? 1.5 : 2/3;
  const cellHeight = Math.min(maxHeight, cellWidth / aspect + rebate);
  const imageHeight = cellHeight - rebate;
  const gridHeight = cellHeight * rows + gapY * (rows - 1);
  const startY = header + (areaHeight - gridHeight) / 2;

  const [saujana] = await csgLoadBrandAssets();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  // Bali's 1280x720 mark has transparent padding; KL's 607x181 mark is tight.
  // Match the visible Bali artwork, not its padded bitmap's drawing box.
  const logoSlotWidth = output === "delivery" ? 280 : 248;
  const logoSlotHeight = output === "delivery" ? 78 : 72;
  const logoWidth = output === "delivery" ? 138 : 126;
  const logoHeight = output === "delivery" ? 42 : 38;
  csgContained(ctx, saujana, margin + (logoSlotWidth - logoWidth) / 2,
    (output === "delivery" ? 6 : 128) + (logoSlotHeight - logoHeight) / 2,
    logoWidth, logoHeight);
  ctx.fillStyle = "#d58d22"; ctx.fillRect(margin, header - 17, usableWidth, 1.5);
  ctx.fillStyle = "#b7b0a5"; ctx.font = output === "delivery" ? "600 14px Arial" : "600 13px Arial";
  ctx.letterSpacing = output === "delivery" ? "1.8px" : "1.5px";
  ctx.textAlign = "left";
  const title = [filmName.trim() || "Saujana roll", customerName.trim()].filter(Boolean).join(" · ");
  ctx.fillText(title, margin, header - 27);
  ctx.textAlign = "right";
  ctx.fillText(`${frames.length} FRAMES · ${format === "half" ? "HALF FRAME" : "FULL FRAME"}`, width - margin, header - 27);
  ctx.letterSpacing = "0px";

  for (let row = 0; row < rows; row += 1) {
    const rowStart = row * columns;
    const rowCount = Math.min(columns, frames.length - rowStart);
    if (rowCount <= 0) break;
    const rowWidth = rowCount * cellWidth + Math.max(0,rowCount-1) * gapX;
    const rowX = margin + (usableWidth - rowWidth) / 2;
    for (let column = 0; column < rowCount; column += 1) {
      const index = rowStart + column;
      const x = rowX + column * (cellWidth + gapX);
      const y = startY + row * (cellHeight + gapY);
      ctx.fillStyle = "#151515"; ctx.fillRect(x,y,cellWidth,imageHeight);
      const bitmap = await createImageBitmap(frames[index].blob);
      csgContained(ctx, bitmap, x, y, cellWidth, imageHeight);
      bitmap.close();
      csgRebate(ctx,x,y+imageHeight,cellWidth,rebate,index+1,numbered,cellWidth<100);
    }
  }

  ctx.fillStyle = "#d58d22"; ctx.font = output === "delivery" ? "600 13px Arial" : "600 14px Arial";
  ctx.letterSpacing = "2.4px"; ctx.textAlign = "left";
  ctx.fillText("SAUJANA FILM LAB · KUALA LUMPUR",margin,height-22);
  ctx.textAlign = "right"; ctx.fillText("CONTACT SHEET",width-margin,height-22);
  ctx.letterSpacing = "0px";
}

function csgCanvasBlob(canvas, quality=.86) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("JPEG export failed")),"image/jpeg",quality));
}

async function csgBitmapToPreparedBlob(bitmap) {
  const maxSide = 1800;
  const scale = Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1,Math.round(bitmap.width*scale));
  canvas.height = Math.max(1,Math.round(bitmap.height*scale));
  const ctx = canvas.getContext("2d",{colorSpace:"srgb"});
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  if (typeof bitmap.close === "function") bitmap.close();
  return csgCanvasBlob(canvas,.88);
}

async function csgTiffToPreparedBlob(file) {
  if (!window.UTIF) {
    throw new Error("TIFF decoder is still loading. Wait a moment and try again.");
  }
  const buffer = await file.arrayBuffer();
  const ifds = UTIF.decode(buffer);
  const image = ifds && ifds[0];
  if (!image) throw new Error("No image was found inside this TIFF file.");
  UTIF.decodeImage(buffer,image);
  const rgba = UTIF.toRGBA8(image);
  const width = Number(image.width) || Number(image.t256 && image.t256[0]);
  const height = Number(image.height) || Number(image.t257 && image.t257[0]);
  if (!width || !height || !rgba) throw new Error("This TIFF file could not be decoded.");

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  source.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);

  const maxSide = 1800;
  const scale = Math.min(1,maxSide/Math.max(width,height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1,Math.round(width*scale));
  canvas.height = Math.max(1,Math.round(height*scale));
  const ctx = canvas.getContext("2d",{colorSpace:"srgb"});
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  return csgCanvasBlob(canvas,.88);
}

async function csgFileToPreparedBlob(file) {
  try {
    return await csgBitmapToPreparedBlob(await createImageBitmap(file,{imageOrientation:"from-image"}));
  } catch (error) {
    if (csgIsTiffFile(file)) return csgTiffToPreparedBlob(file);
    throw error;
  }
}

function ContactSheetGenerator({ embedded=false, orderNumber="", customerName:linkedCustomerName="", rolls:linkedRolls=[], excludedRolls=[], onRollInclusionChange=null, onSheetsChange=null, layoutPreview=false, onSheetInvalidated=null }) {
  const availableRolls = React.useMemo(() => linkedRolls.map(value=>String(value||"").trim()).filter(Boolean), [linkedRolls]);
  const [selectedRoll,setSelectedRoll] = React.useState(0);
  const [frames,setFrames] = React.useState([]);
  const [filmName,setFilmName] = React.useState(availableRolls[0] || "Kodak Ultramax 400");
  const [customerName,setCustomerName] = React.useState(linkedCustomerName || "");
  const [renderTag,setRenderTag] = React.useState("");
  const [format,setFormat] = React.useState("full");
  const [numbered,setNumbered] = React.useState(true);
  const [confirmed,setConfirmed] = React.useState(false);
  const [active,setActive] = React.useState("delivery");
  const [working,setWorking] = React.useState(false);
  const [isPreparing,setIsPreparing] = React.useState(false);
  const [prepareCount,setPrepareCount] = React.useState({current:0,total:0});
  const [progress,setProgress] = React.useState("");
  const [error,setError] = React.useState("");
  const [dragging,setDragging] = React.useState(false);
  const [rollWorkspaces,setRollWorkspaces] = React.useState({});
  const deliveryRef = React.useRef(null);
  const storyRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const folderInputRef = React.useRef(null);
  const [readyRolls,setReadyRolls] = React.useState({});
  const demoLoaded=React.useRef(false);


  React.useEffect(()=>{
    if(!layoutPreview)return;
    const invalid=[];
    for(const [index,saved] of Object.entries(readyRolls)){
      const current=Number(index)===selectedRoll?{frames,renderTag,format,numbered}:rollWorkspaces[index];
      if(!current||saved.frames!==current.frames||saved.renderTag!==current.renderTag||saved.format!==current.format||saved.numbered!==current.numbered||saved.filmName!==availableRolls[index]||saved.customerName!==customerName)invalid.push(index);
    }
    if(!invalid.length)return;
    setReadyRolls(previous=>{const next={...previous};invalid.forEach(index=>delete next[index]);return next;});
    invalid.forEach(index=>onSheetInvalidated?.(Number(index)));
  },[layoutPreview,readyRolls,frames,renderTag,format,numbered,selectedRoll,rollWorkspaces,availableRolls,customerName]);

  React.useEffect(() => {
    if (linkedCustomerName) setCustomerName(linkedCustomerName);
  },[linkedCustomerName]);

  React.useEffect(() => {
    if (!availableRolls.length) {
      setSelectedRoll(0);
      setFrames([]);
      setRollWorkspaces({});
      setConfirmed(false);
      setProgress("");
      setError("");
      return;
    }
    const safeIndex = Math.min(selectedRoll,availableRolls.length-1);
    if (safeIndex !== selectedRoll) setSelectedRoll(safeIndex);
    setFilmName(availableRolls[safeIndex]);
  },[availableRolls,selectedRoll]);

  React.useEffect(() => {
    if (!frames.length) return;
    let live = true;
    setWorking(true); setError("");
    (async()=>{
      try {
        if(layoutPreview){
          // Commit complete sheets together so a cancelled roll render cannot paint over the next one.
          const delivery=document.createElement('canvas'),story=document.createElement('canvas');
          await csgRender(delivery,frames,"delivery",format,numbered,filmName,customerName,renderTag);
          if(!live)return;
          await csgRender(story,frames,"story",format,numbered,filmName,customerName,renderTag);
          if(!live)return;
          for(const [target,source] of [[deliveryRef.current,delivery],[storyRef.current,story]]){
            target.width=source.width;target.height=source.height;target.getContext('2d').drawImage(source,0,0);
          }
        }else{
          await csgRender(deliveryRef.current,frames,"delivery",format,numbered,filmName,customerName,renderTag);
          if (!live) return;
          await csgRender(storyRef.current,frames,"story",format,numbered,filmName,customerName,renderTag);
        }
      } catch (err) { if (live) setError(err.message || "Could not render the contact sheets."); }
      finally { if (live) setWorking(false); }
    })();
    return ()=>{live=false;};
  },[frames,filmName,customerName,renderTag,format,numbered]);

  function chooseLinkedRoll(index,afterFinalize=false) {
    if (index === selectedRoll || (working&&!afterFinalize)) return;
    const savedTarget = rollWorkspaces[index];
    setRollWorkspaces(previous => ({
      ...previous,
      [selectedRoll]: {frames,renderTag,format,numbered,confirmed,active,progress:afterFinalize?"Contact sheets finalized":progress}
    }));
    setSelectedRoll(index);
    setFilmName(availableRolls[index] || "");
    setFrames(savedTarget?.frames || []);
    setRenderTag(savedTarget?.renderTag || "");
    setFormat(savedTarget?.format || "full");
    setNumbered(savedTarget?.numbered ?? true);
    setConfirmed(savedTarget?.confirmed || false);
    setActive(savedTarget?.active || "delivery");
    setProgress(savedTarget?.progress || (savedTarget?.frames?.length ? `${savedTarget.frames.length} frames ready` : ""));
    setError("");
  }

  async function prepareFiles(files, startAt=0, total=files.length, folderName="") {
    const prepared = [];
    for (let i=0;i<files.length;i+=1) {
      const current = startAt+i+1;
      setPrepareCount({current,total});
      setProgress(`${folderName ? `${folderName} · ` : ""}Preparing frame ${i+1} of ${files.length}`);
      let blob;
      try { blob = await csgFileToPreparedBlob(files[i]); }
      catch(err) { throw new Error(`${files[i].name} could not be decoded. ${err.message || "Export it as JPEG if needed."}`); }
      prepared.push({name:csgFileName(files[i]),blob});
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    return prepared;
  }

  async function prepare(fileList, folderName="") {
    const files = csgSortFiles(fileList);
    if (!files.length) { setError("Choose JPEG or TIFF scan files."); return; }
    setWorking(true); setIsPreparing(true); setPrepareCount({current:0,total:files.length}); setError(""); setFrames([]);
    try {
      const prepared = await prepareFiles(files,0,files.length,folderName);
      setFrames(prepared); setConfirmed(false); setProgress(`${folderName ? `${folderName} · ` : ""}${prepared.length} frames ready`);
    } catch(err) { setError(err.message || "The scans could not be prepared."); setProgress(""); }
    finally { setWorking(false); setIsPreparing(false); }
  }

  async function prepareFolderDrop(dataTransfer) {
    setError("");
    let groups;
    try { groups = await csgDroppedFolders(dataTransfer); }
    catch(err) { setError(err.message || "The dropped folder could not be read."); return; }
    if (!groups.length) { prepare(dataTransfer.files); return; }
    const emptyFolder = groups.find(group=>!group.files.length);
    if (emptyFolder) { setError(`${emptyFolder.name} does not contain JPEG or TIFF scan files.`); return; }
    if (groups.length === 1) { prepare(groups[0].files,groups[0].name); return; }

    const rollIndexes = availableRolls.map((_,index)=>index).filter(index=>!excludedRolls.includes(index));
    if (groups.length > rollIndexes.length) {
      setError(`You dropped ${groups.length} roll folders, but only ${rollIndexes.length} included rolls are in the order form.`);
      return;
    }

    const total = groups.reduce((sum,group)=>sum+group.files.length,0);
    setWorking(true); setIsPreparing(true); setPrepareCount({current:0,total}); setFrames([]);
    try {
      let startAt = 0;
      const preparedWorkspaces = {};
      for (let i=0;i<groups.length;i+=1) {
        const group = groups[i];
        const prepared = await prepareFiles(group.files,startAt,total,group.name);
        startAt += group.files.length;
        preparedWorkspaces[rollIndexes[i]] = {
          frames:prepared,renderTag:"",format:"full",numbered:true,confirmed:false,active:"delivery",
          progress:`${group.name} · ${prepared.length} frames ready`
        };
      }
      const firstIndex = rollIndexes[0];
      const first = preparedWorkspaces[firstIndex];
      setRollWorkspaces(previous=>({...previous,...preparedWorkspaces}));
      setSelectedRoll(firstIndex); setFilmName(availableRolls[firstIndex] || "");
      setFrames(first.frames); setRenderTag(first.renderTag); setFormat(first.format); setNumbered(first.numbered);
      setConfirmed(false); setActive("delivery"); setProgress(first.progress);
    } catch(err) { setError(err.message || "The roll folders could not be prepared."); setProgress(""); }
    finally { setWorking(false); setIsPreparing(false); }
  }

  async function preparePair() {
    if (!frames.length || !confirmed || working || (layoutPreview&&excludedRolls.includes(selectedRoll))) return;
    let advanceIndex;
    setWorking(true); setError(""); setProgress("Preparing both contact sheets");
    try {
      const deliveryBlob = await csgCanvasBlob(deliveryRef.current);
      const storyBlob = await csgCanvasBlob(storyRef.current);
      setProgress("Contact sheet ready for delivery");
      if(layoutPreview)setReadyRolls(previous=>({...previous,[selectedRoll]:{frames,renderTag,format,numbered,filmName,customerName}}));
      if (onSheetsChange) onSheetsChange({
        ready:true,
        rollIndex:selectedRoll,
        rollKey:`${selectedRoll}:${filmName}`,
        orderNumber,
        filmName,
        customerName,
        frameCount:frames.length,
        renderTag,
        format,
        numbered,
        deliveryBlob,
        storyBlob,
        deliveryPreviewUrl:URL.createObjectURL(deliveryBlob),
        storyPreviewUrl:URL.createObjectURL(storyBlob)
      });
      if(layoutPreview){
        const nextIndexes=availableRolls.map((_,index)=>index).filter(index=>index!==selectedRoll&&!excludedRolls.includes(index)&&!readyRolls[index]);
        const nextIndex=nextIndexes.find(index=>index>selectedRoll)??nextIndexes[0];
        if(nextIndex!==undefined)advanceIndex=nextIndex;
        else setProgress("All done. You can publish and generate the link.");
      }
    } catch(err) { setError(err.message || "Could not prepare the contact sheets."); }
    finally { setWorking(false); }
    if(advanceIndex!==undefined)ReactDOM.unstable_batchedUpdates(()=>chooseLinkedRoll(advanceIndex,true));
  }

  const rollIncluded = !excludedRolls.includes(selectedRoll);

  if(layoutPreview)return <ContactSheetStudio
    rolls={availableRolls} selectedRoll={selectedRoll} workspaces={rollWorkspaces} frames={frames} readyRolls={readyRolls} excludedRolls={excludedRolls}
    chooseRoll={chooseLinkedRoll} includeRoll={onRollInclusionChange} filmName={filmName} customerName={customerName} orderNumber={orderNumber}
    renderTag={renderTag} setRenderTag={setRenderTag} format={format} setFormat={setFormat} numbered={numbered} setNumbered={setNumbered}
    confirmed={confirmed} setConfirmed={setConfirmed} active={active} setActive={setActive} working={working} isPreparing={isPreparing}
    prepareCount={prepareCount} progress={progress} error={error} dragging={dragging} setDragging={setDragging}
    prepareFolderDrop={prepareFolderDrop} prepare={prepare} preparePair={preparePair} deliveryRef={deliveryRef} storyRef={storyRef} inputRef={inputRef} folderInputRef={folderInputRef}/>;


}
