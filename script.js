const vertexShader = `
#ifdef GL_ES
precision mediump float;
#endif

attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const cellTypes = {
  VOID: 0,
  WALL: 1,
  SAND: 2,
  WATER: 3,
};

const selectElement = document.querySelector('select');
for (const [key, value] of Object.entries(cellTypes)) {
  const o = document.createElement('option');
  o.value = value;
  o.innerText = key;
  o.selected = key == 'SAND';
  selectElement.appendChild(o);
}

const header = `
${Object.entries(cellTypes).map(([key, value]) => `#define ${key} ${value}\n`).join('\n')}

#ifdef GL_ES
precision mediump float;
#endif

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
     return mod289(((x*34.0)+1.0)*x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 =   v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  // Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

uniform float u_time;
uniform vec2 u_resolution;

// Previous state
uniform sampler2D state;

struct cell {
  // All fields are 0-255
  int typ;
  int a;
  int b;
  int c;
};

cell cel(int typ) {
  return cell(typ, 0, 0, 0);
}

cell get(vec2 coord) {
  vec2 p = gl_FragCoord.xy + coord;
  if (p.x < 0.0 || p.y < 0.0 || p.x > u_resolution.x || p.y > u_resolution.y) {
    return cel(WALL);
  }

  ivec4 v = ivec4(texture2D(state, p / u_resolution) * 255.0);
  return cell(v.x, v.y, v.z, v.w);
}

cell get(int dx, int dy) {
  return get(vec2(float(dx), float(dy)));
}

cell get() {
  return get(0, 0);
}

float rand(int dx, int dy) {
  vec2 p = gl_FragCoord.xy + vec2(float(dx), float(dy));
  vec3 a = vec3(p.x, p.y, u_time);
  return snoise(a);
}

int rand_dir(int dx, int dy) {
  return rand(dx, dy) > 0.0 ? 1 : -1;
}
`;

const renderShader = header+`
void main() {
  cell cur = get();
  vec3 color = vec3(0.0);
  if (cur.typ == SAND) {
    color = vec3(1.0, 1.0, 0.5);
  } else if (cur.typ == WALL) {
    color = vec3(0.4);
  } else if (cur.typ == WATER) {
    color = vec3(0.1, 0.1, 0.8);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

const simulateShader = header+`
void main() {
  cell c = get();
  int typ = c.typ;
  if (typ == SAND) {
    cell under = get(0, -1);
    if (under.typ == VOID) {
      c = under;
    } else if (under.typ == WATER && get(0, -2).typ != VOID) {
      c = under;
    } else {
      int dir = rand_dir(0, 0);
      cell diag = get(dir, -1);
      cell next = get(dir, 0);
      cell next_2 = get(dir * 2, 0);

      // Only replace self with VOID if there is no SAND next to me, or a SAND on the other side that's going to fall in the same direction. Maybe compare value of rand instead of just do nothing?
      if (diag.typ == VOID && !(next.typ == SAND || (next_2.typ == SAND && rand_dir(dir * 2, 0) == -dir))) {
        c = cell(VOID, 0, 0, 0);
      }
    }
  } else if (typ == WATER) {
    cell under = get(0, -1);
    if (under.typ == VOID) {
      c = cell(VOID, 0, 0, 0);
    } else {
      int dir = rand_dir(0, 0);
      cell above = get(0, 1);
      if (above.typ == SAND) {
        c = above;
      }
    }
  } else if (typ == VOID) {
    cell above = get(0, 1);
    if (above.typ == SAND || above.typ == WATER) {
      c = above;
    } else {
      // Diagonal fall
      cell left = get(-1, 1);
      cell right = get(1, 1);
      int left_dir = rand_dir(-1, 1);
      int right_dir = rand_dir(1, 1);

      bool left_wants = left.typ == SAND && left_dir == 1 && get(-1, 0).typ != VOID;
      bool right_wants = right.typ == SAND && right_dir == -1 && get(1, 0).typ != VOID;

      if (left_wants) {
        if (!right_wants) {
          c = left;
        }
      } else if (right_wants) {
        c = right;
      }
    }
  }
  gl_FragColor = vec4(c.typ, c.a, c.b, c.c) / 255.0;
}
`;

function main() {
  const canvas = document.querySelector("#canvas");
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;

  const resolution = Math.min(1024, canvas.width);

  const gl = canvas.getContext("webgl");

  const compileShader = (t, source) => {
    const s = gl.createShader(t);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw `Could not compile shader ${t} ${source} ${gl.getShaderInfoLog(s)}`;
    }
    return s;
  };

  const vShader = compileShader(gl.VERTEX_SHADER, vertexShader);
  const fShader = compileShader(gl.FRAGMENT_SHADER, renderShader);

  const program = gl.createProgram();
  gl.attachShader(program, vShader);
  gl.attachShader(program, fShader);
  gl.linkProgram(program);

  gl.deleteShader(fShader);

  const stepShader = compileShader(gl.FRAGMENT_SHADER, simulateShader);

  const stepProgram = gl.createProgram();
  gl.attachShader(stepProgram, vShader);
  gl.attachShader(stepProgram, stepShader);
  gl.linkProgram(stepProgram);

  gl.deleteShader(vShader);
  gl.deleteShader(stepShader);

  const a = new Uint8Array(resolution * resolution * 4);
  for (let i = 0; i < a.length; i += 4) {
    a[i] = Math.random() > 0.75 ? cellTypes.SAND : 0;
    a[i+1] = 0;
    a[i+2] = 0;
    a[i+3] = 0;
  }

  const tex = [0, 1].map((i) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, resolution, resolution, 0, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  });

  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1.0, -1.0,
    1.0, -1.0,
    -1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    1.0, 1.0
  ]), gl.STATIC_DRAW);

  const verticesLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(verticesLoc);
  gl.vertexAttribPointer(verticesLoc, 2, gl.FLOAT, false, 0, 0);

  /* Don't need to do this again because the previous one already did it??
  const verticesLoc = gl.getAttribLocation(stepProgram, 'a_position');
  gl.enableVertexAttribArray(verticesLoc);
  gl.vertexAttribPointer(verticesLoc, 2, gl.FLOAT, false, 0, 0);
  */

  let resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
  gl.useProgram(program);
  gl.uniform2f(resolutionLoc, canvas.width, canvas.height);

  resolutionLoc = gl.getUniformLocation(stepProgram, 'u_resolution');
  gl.useProgram(stepProgram);
  gl.uniform2f(resolutionLoc, resolution, resolution);

  const progStateLoc = gl.getUniformLocation(program, "state");
  const stepStateLoc = gl.getUniformLocation(stepProgram, "state");
  const timeLoc = gl.getUniformLocation(stepProgram, 'u_time');

  const buffers = [gl.createFramebuffer(), gl.createFramebuffer()];
  gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[0]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[0], 0);

  gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[1]);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex[1], 0);

  gl.viewport(0, 0, canvas.width, canvas.height);

  let bufIndex = 0;

  let mouseDown = false;
  canvas.addEventListener('mousedown', function(event) {
    event.preventDefault();
    mouseDown = true;
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });
  canvas.addEventListener('touchstart', function(event) {
    event.preventDefault();
    mouseDown = true;
    event = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });
  canvas.addEventListener('mouseup', function(event) {
    event.preventDefault();
    mouseDown = false;
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });
  canvas.addEventListener('touchend', function(event) {
    event.preventDefault();
    mouseDown = false;
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });
  canvas.addEventListener('touchmove', function(event) {
    event.preventDefault();
    event = event.touches[0];
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });
  let mouseX = 0;
  let mouseY = 0;
  canvas.addEventListener('mousemove', function(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = Math.floor(((event.clientX - rect.left) / rect.width) * resolution);
    mouseY = resolution - Math.ceil(((event.clientY - rect.top) / rect.height) * resolution);
  });

  const render = () => {
    // Unbind frame buffer (i.e. set output to canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(program);
    gl.uniform1i(progStateLoc, bufIndex);
    gl.drawArrays(gl.TRIANGLES, 0, 6.0);
  };

  let lastRender = performance.now();
  let stepCounter = 0;
  const step = () => {
    if (mouseDown) {
      const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
      gl.bindTexture(gl.TEXTURE_2D, tex[1 - bufIndex]);
      /*
      const cell = new Uint8Array([parseInt(selectElement.value), 0, 0, 0]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, mouseX, mouseY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, cell);
      */
      const cell = new Uint8Array([
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0,
        parseInt(selectElement.value), 0, 0, 0
      ]);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, mouseX-1, mouseY-1, 3, 3, gl.RGBA, gl.UNSIGNED_BYTE, cell);

      // restore
      gl.bindTexture(gl.TEXTURE_2D, prev);
    }

    const t = performance.now();
    // Bind state frame buffer, draw to it
    gl.bindFramebuffer(gl.FRAMEBUFFER, buffers[bufIndex]);
    gl.useProgram(stepProgram);
    gl.uniform1i(stepStateLoc, 1 - bufIndex);
    gl.uniform1f(timeLoc, t / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6.0);

    bufIndex = 1 - bufIndex;
    lastRender = t;

    render();
    stepCounter++;

    requestAnimationFrame(step);
  };
  render();
  requestAnimationFrame(step);
}

main();
