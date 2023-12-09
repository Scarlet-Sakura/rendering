"use strict";
var obj_filename = "../objects/teapot.obj";

var g_objDoc = null; // Info parsed from OBJ file
var g_drawingInfo = null; // Info for drawing the 3D model with WebGL

//changing camera constant & aspect ratio
var camera_const = 2.5;
var aspect_ratio = 800 / 450;
var index_lenght = 0;

//adding lenght of indices
var uniforms = new Float32Array([aspect_ratio, camera_const, index_lenght]);

window.onload = function () {
  main();
};
async function main() {
  const gpu = navigator.gpu;

  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    console.error("WebGPU is not available");
    return;
  }
  const device = await adapter.requestDevice();

  const canvas = document.getElementById("webgpu-canvas");
  const context =
    canvas.getContext("gpupresent") || canvas.getContext("webgpu");

  const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device: device,
    format: canvasFormat,
  });
  const wgsl = device.createShaderModule({
    code: document.getElementById("wgsl").text,
  });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: wgsl,
      entryPoint: "main_vs",
    },
    fragment: {
      module: wgsl,
      entryPoint: "main_fs",
      targets: [{ format: canvasFormat }],
    },
    primitive: {
      topology: "triangle-strip",
    },
  });

  const uniformBuffer = device.createBuffer({
    size: 64, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);
  readOBJFile(obj_filename, 1, true); // file name, scale, ccw vertices

  function animate() {
    if (!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete()) {
      // OBJ and all MTLs are available
      const buffers = {
        normalBuffer: null,
        indexBuffer: null,
        uniformBuffer: uniformBuffer,
        vertexBuffer: null,
      };
      bindGroup = onReadComplete(device, pipeline, buffers);
    }
    if (!g_drawingInfo) {
      requestAnimationFrame(animate);
      return;
    }
    render(device, context, pipeline, bindGroup);
  }
  animate();
}

function render(device, context, pipeline, bindGroup) {
  // Create a render pass in a command buffer and submit it
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });
  pass.setPipeline(pipeline);

  // Set the bind group which contains three bindings
  pass.setBindGroup(0, bindGroup);
  pass.draw(4);
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// Read a file
function readOBJFile(fileName, scale, reverse) {
  var request = new XMLHttpRequest();
  request.onreadystatechange = function () {
    if (request.readyState === 4 && request.status !== 404)
      onReadOBJFile(request.responseText, fileName, scale, reverse);
  };
  request.open("GET", fileName, true); // Create a request to get file
  request.send(); // Send the request
}
var bindGroup;
// OBJ file has been read
function onReadOBJFile(fileString, fileName, scale, reverse) {
  var objDoc = new OBJDoc(fileName); // Create a OBJDoc object
  var result = objDoc.parse(fileString, scale, reverse);
  if (!result) {
    g_objDoc = null;
    g_drawingInfo = null;
    console.log("OBJ file parsing error.");
    return;
  }
  g_objDoc = objDoc;
}

// OBJ File has been read completely
function onReadComplete(device, pipeline, buffers) {
  g_drawingInfo = g_objDoc.getDrawingInfo();
  console.log(g_drawingInfo);
  // Create and populate the vertex buffer
  buffers.vertexBuffer = device.createBuffer({
    size: g_drawingInfo.vertices.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(buffers.vertexBuffer, 0, g_drawingInfo.vertices);
  console.log("processObjFile... ");

  //here we add the length of indices in the secondposition of the uniform.
  buffers.uniformBuffer = device.createBuffer({
    size: 64, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  uniforms[2] = g_drawingInfo.indices.length;
  console.log("test:", uniforms[2]);
  device.queue.writeBuffer(buffers.uniformBuffer, 0, uniforms);

  console.log("num meshes:", g_drawingInfo.vertices.length);
  console.log("vertices:", g_drawingInfo.vertices);
  console.log("indices:", g_drawingInfo.indices);
  console.log("normals:", g_drawingInfo.normals);

  // Create and populate the index buffer
  buffers.indexBuffer = device.createBuffer({
    size: g_drawingInfo.indices.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(buffers.indexBuffer, 0, g_drawingInfo.indices);

  buffers.normalBuffer = device.createBuffer({
    size: g_drawingInfo.normals.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
  });
  device.queue.writeBuffer(buffers.normalBuffer, 0, g_drawingInfo.normals);

  // create bind Group
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.normalBuffer } },
      { binding: 1, resource: { buffer: buffers.indexBuffer } },
      { binding: 2, resource: { buffer: buffers.uniformBuffer } },
      { binding: 3, resource: { buffer: buffers.vertexBuffer } },
    ],
  });
  return bindGroup;
}
