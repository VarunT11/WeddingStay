import AppKit
let directory=URL(fileURLWithPath:CommandLine.arguments.count>1 ? CommandLine.arguments[1]:"public")
try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
for (filename,size) in [("icon-192.png",192),("icon-512.png",512),("icon-maskable.png",512),("apple-touch-icon.png",180)] {
 let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:size,pixelsHigh:size,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState()
 NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap)
 let transform=NSAffineTransform();transform.scale(by:CGFloat(size)/512);transform.concat()
 NSColor(calibratedRed:248/255,green:247/255,blue:243/255,alpha:1).setFill();NSRect(x:0,y:0,width:512,height:512).fill()
 NSColor(calibratedRed:116/255,green:51/255,blue:70/255,alpha:1).setFill();NSBezierPath(roundedRect:NSRect(x:48,y:48,width:416,height:416),xRadius:108,yRadius:108).fill()
 NSColor(calibratedRed:248/255,green:238/255,blue:229/255,alpha:1).setFill()
 for angle in stride(from:0, to:360, by:60) {
  let petal=NSBezierPath(ovalIn:NSRect(x:221,y:255,width:70,height:130))
  let rotate=NSAffineTransform();rotate.translateX(by:256,yBy:256);rotate.rotate(byDegrees:CGFloat(angle));rotate.translateX(by:-256,yBy:-256);petal.transform(using:rotate as AffineTransform);petal.fill()
 }
 NSColor(calibratedRed:198/255,green:155/255,blue:86/255,alpha:1).setFill();NSBezierPath(ovalIn:NSRect(x:231,y:231,width:50,height:50)).fill()
 NSGraphicsContext.restoreGraphicsState()
 try bitmap.representation(using:.png,properties:[:])!.write(to:directory.appendingPathComponent(filename))
}
