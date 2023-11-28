"use strict";
//change to 1, -1 for third ex
window.onload = function () {
  main();
};
async function main() {
  const gpu = navigator.gpu;
  const adapter = await gpu.requestAdapter();
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

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  var shader = 0;
  var camera_const = 1.5;
  var aspect_ratio = canvas.width / canvas.height;
  var uniforms = new Float32Array([aspect_ratio, camera_const]);
  device.queue.writeBuffer(uniformBuffer, 0, uniforms);

  document.getElementById("zoomSlider").addEventListener("input", (event) => {
    camera_const = parseFloat(event.target.value);
    requestAnimationFrame(tick);
  });
  function tick() {
    uniforms[1] = camera_const;
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    render(device, context, pipeline, bindGroup);
  }
  tick();

  const shaderMenu = document.getElementById("shaderMenu");
  const materialMenu = document.getElementById("materialMenu");
  const hitInfoData = new Float32Array([
    0.0, // has_hit (bool as a float)
    -1.0, // dist (f32)
    0.0,
    0.0,
    0.0, // position (vec3<f32>)
    0.0,
    0.0,
    0.0, // normal (vec3<f32>)
    0.0,
    0.0,
    0.0, // color (vec3<f32>)
    0.0, // shader (i32)
    0.0, // depth (f32)
    0.1, // specular (f32)
    0.0, // sphere (i32)
    0.0, //material (i32)
  ]);
  /*shaderMenu.addEventListener("change", () => {
       // Get the selected shader value and update the scene shader accordingly
       shader = parseInt(shaderMenu.value);
       
       requestAnimationFrame(select);});
   function select(){
      
      hitInfoData[5]=shader;
       console.log(hitInfoData[5]);
         // Write the updated HitInfo data to the buffer
       device.queue.writeBuffer(uniformBuffer, 0, hitInfoData);

    // Call the render function to re-render the scene with the updated data
        render(device, context, pipeline, bindGroup);}
        select();*/
  // You can update your scene shader here based on the selectedShader value
  // For example, you can use a switch statement to select different shaders.

  materialMenu.addEventListener("change", () => {
    // Get the selected material value and update the scene material accordingly
    const selectedMaterial = parseInt(materialMenu.value);
    hitInfoData[8] = 0;

    hitInfoData[9] = selectedMaterial;
    console.log(hitInfoData[9]);
    device.queue.writeBuffer(uniformBuffer, 0, hitInfoData);

    // You can update your scene material here based on the selectedMaterial value
    // For example, you can switch between different objects (sphere, plane, triangle).
  });

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

    // Insert render pass commands here
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
