"use strict";
var obj_filename = "../objects/bunny.obj";

var g_objDoc = null; // Info parsed from OBJ file
var g_drawingInfo = null; // Info for drawing the 3D model with WebGL

//changing camera constant & aspect ratio
var camera_const = 3.5;
var aspect_ratio = 800 / 450;
var subdivisionLevel = 1;
var sphere_option = 1.0;
var object_option = 1.0;
var uniforms = new Float32Array([
  aspect_ratio,
  camera_const,
  sphere_option,
  object_option,
  subdivisionLevel
]);

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
  readOBJFile(obj_filename, 1, true); // file name, scale, ccw vertices

  const uniformBuffer = device.createBuffer({
    size: 64, // number of bytes
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  let jitter = new Float32Array(200);
  const jitterBuffer = device.createBuffer({
    size: jitter.byteLength,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
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

  const bindGroupBuffers = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: jitterBuffer },
      },
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
    console.log(g_drawingInfo.indices);
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

  //initialize scene
  animate();

  function animate() {
    if (!g_drawingInfo && g_objDoc && g_objDoc.isMTLComplete()) {
      // OBJ and all MTLs are available

      bindGroup = onReadComplete(device, pipeline, buffers);
    }
    if (!g_drawingInfo) {
      requestAnimationFrame(animate);
      return;
    }
    uniforms[4] = subdivisionLevel;
    //console.log(uniforms[5]);
    compute_jitters(jitter, 1 / canvas.height, subdivisionLevel);

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    device.queue.writeBuffer(jitterBuffer, 0, jitter);
    console.log(uniformBuffer);
    render(device, context, pipeline, bindGroup, bindGroupBuffers);
  }

  const subdivisionLevelElement = document.getElementById("subdivisionLevel");
  const incrementButton = document.getElementById("incrementButton");
  const decrementButton = document.getElementById("decrementButton");

  // Update the subdivision level display
  function updateSubdivisionLevel() {
    subdivisionLevelElement.textContent = subdivisionLevel;
    const numericValue = parseInt(subdivisionLevelElement.textContent, 10); // Use parseInt to parse as an integer

    console.log(numericValue); // This will log the number 42

    compute_jitters(jitter, 1 / canvas.height, numericValue);

    animate();
  }

  // Event listener for the increment button
  incrementButton.addEventListener("click", () => {
    if (subdivisionLevel < 10) {
      subdivisionLevel++; // You can adjust the maximum level if needed.
      updateSubdivisionLevel();
      // Call a function to update jitter vectors and perform ray tracing with the new level.
    }
  });

  // Event listener for the decrement button
  decrementButton.addEventListener("click", () => {
    if (subdivisionLevel > 1) {
      subdivisionLevel--;
      updateSubdivisionLevel();
      // Call a function to update jitter vectors and perform ray tracing with the new level.
    }
  });

  updateSubdivisionLevel();

  function compute_jitters(jitter, pixelsize, subdivs) {
    const step = pixelsize / subdivs;
    if (subdivs < 2) {
      jitter[0] = 0.0;
      jitter[1] = 0.0;
    } else {
      for (var i = 0; i < subdivs; ++i)
        for (var j = 0; j < subdivs; ++j) {
          const idx = (i * subdivs + j) * 2;
          jitter[idx] = (Math.random() + j) * step - pixelsize * 0.5;
          jitter[idx + 1] = (Math.random() + i) * step - pixelsize * 0.5;
        }
    }
  }

  async function render(device, context, pipeline, bindGroup, bindGroup2) {
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

    // Set the bind group which contains three bindings
    pass.setBindGroup(0, bindGroup);
    pass.setBindGroup(1, bindGroup2);
    pass.setPipeline(pipeline);
    pass.draw(4);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
