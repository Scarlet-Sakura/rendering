"use strict";
var obj_filename = "objects/CornellBoxWithBlocks.obj";

var g_objDoc = null; // Info parsed from OBJ file
var g_drawingInfo = null; // Info for drawing the 3D model with WebGL

//changing camera constant & aspect ratio
var camera_const = 1.5;
var width = 512;
var height = 512;
var frame = 0.0;
var uniforms = new Float32Array([width, height, camera_const, frame]);

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
      targets: [{ format: canvasFormat }, { format: "rgba32float" }],
    },
    primitive: {
      topology: "triangle-strip",
    },
  });
  readOBJFile(obj_filename, 1, true); // file name, scale, ccw vertices

  const uniformBuffer = device.createBuffer({
    size: 64, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const buffers = {
    positions: null,
    normals: null,
    colors: null,
    indices: null, //for positions
    treeIds: null,
    bspTree: null,
    bspPlanes: null,
    aabb: null,
  };
  let textures = new Object();
  textures.width = canvas.width;
  textures.height = canvas.height;
  textures.renderSrc = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    format: "rgba32float",
  });
  textures.renderDst = device.createTexture({
    size: [canvas.width, canvas.height],
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    format: "rgba32float",
  });
  const bindGroupBuffers = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      { binding: 1, resource: textures.renderDst.createView() },
    ],
  });

  var bindGroup;

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
    const returnedBuffers = build_bsp_tree(g_drawingInfo, device, buffers);
    // Get an array of keys from returnedBuffers
    const keys = Object.keys(returnedBuffers);

    for (const key of keys) {
      // Check if the key exists in your buffers object
      if (buffers.hasOwnProperty(key)) {
        buffers[key] = returnedBuffers[key];
      }
    }
    console.log(returnedBuffers.normals);
    console.log(buffers);
    console.log(buffers.normals);

    // create bind Group
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: buffers.normals } },
        { binding: 1, resource: { buffer: buffers.indices } },
        { binding: 2, resource: { buffer: buffers.aabb } },
        { binding: 3, resource: { buffer: buffers.positions } },
        { binding: 4, resource: { buffer: buffers.treeIds } },
        { binding: 5, resource: { buffer: buffers.bspTree } },
        { binding: 6, resource: { buffer: buffers.bspPlanes } },
      ],
    });

    return bindGroup;
  }

  function animate() {
    if (!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete()) {
      // OBJ and all MTLs are available

      bindGroup = onReadComplete(device, pipeline, buffers);
    }
    if (!g_drawingInfo) {
      requestAnimationFrame(animate);
      return;
    }

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    render(device, context, pipeline, bindGroup, bindGroupBuffers);
  }
  //initiate animate
  animate();

  async function render(device, context, pipeline, bindGroup, bindGroup2) {
    // Create a render pass in a command buffer and submit it
    frame += 1;
    uniforms[3] = frame;
    console.log(frame);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
        {
          view: textures.renderSrc.createView(),
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);

    pass.setBindGroup(1, bindGroup2);
    pass.draw(4);
    pass.end();
    encoder.copyTextureToTexture(
      { texture: textures.renderSrc },
      { texture: textures.renderDst },
      [textures.width, textures.height]
    );
    // Finish the command buffer and immediately submit it.
    device.queue.submit([encoder.finish()]);
  }
}
