/**
 * Based on https://twitter.com/TheRujiK/status/969581641680195585
 */

class Vec3 {
    public constructor(
        public readonly x: number,
        public readonly y: number,
        public readonly z: number,
    ) {}
    
    public setZ(z: number): Vec3 {
        return new Vec3(this.x, this.y, z);
    }
    
    public norm(): number {
        return Math.hypot(this.x, this.y, this.z);
    }
    
    public add(other: Vec3): Vec3 {
        return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
    }
    public sub(other: Vec3): Vec3 {
        return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
    }
    public scale(factor: number): Vec3 {
        return new Vec3(factor * this.x, factor * this.y, factor * this.z);
    }
    public normalize(length: number): Vec3 {
        return this.scale(length / this.norm());
    }
    public rotateXY(angle: number): Vec3 {
        const c = Math.cos(angle), s = Math.sin(angle);
        return new Vec3(c * this.x + s * this.y, -s * this.x + c * this.y, this.z);
    }
}

/**
 * Moves `a` towards or away from `b` to reach the desired distance.
 */
function reach(a: Vec3, b: Vec3, distance: number): Vec3 {
    const diff = a.sub(b);
    const diffNorm = diff.norm();
    if(diffNorm < 1e-6) { return a; }
    const scaledDiff = diff.scale(distance / diffNorm);
    return b.add(scaledDiff);
}

function iterateForwards(points: Vec3[], target: Vec3, distance: number): void {
    const n = points.length;
    points[0] = target;
    for(let i = 1; i < n; ++i) {
        points[i] = reach(points[i], points[i - 1], distance);
    }
}
function iterateBackwards(points: Vec3[], target: Vec3, distance: number): void {
    const n = points.length;
    points[n - 1] = target;
    for(let i = n - 2; i >= 0; --i) {
        points[i] = reach(points[i], points[i + 1], distance);
    }
}
function iterateForwardsAndBackwards(points: Vec3[], target: Vec3, distance: number): void {
    const end = points[points.length - 1];
    iterateForwards(points, target, distance);
    iterateBackwards(points, end, distance);
}

type IKNode =
    | {kind: 'internal', pos: Vec3, children: [node: IKNode, distance: number][]}
    | {kind: 'loose', pos: Vec3}
    | {kind: 'target', pos: Vec3, goal: Vec3}

function buildChain(size: number, pos: Vec3, delta: Vec3, hasGoal: boolean): IKNode[] {
    let node: IKNode = hasGoal ? {
        kind: 'target',
        pos,
        goal: pos,
    } : {
        kind: 'loose',
        pos,
    };
    const r: IKNode[] = [node];
    for(let i = 1; i < size; ++i) {
        pos = pos.add(delta);
        node = {
            kind: 'internal',
            pos,
            children: [[node, delta.norm()]],
        };
        r.push(node);
    }
    r.reverse();
    return r;
}

function ikDown(node: IKNode): void {
    switch(node.kind) {
        case 'loose':
            // do nothing
            break;
        case 'target':
            node.pos = node.goal;
            break;
        case 'internal':
            let posSum = new Vec3(0, 0, 0);
            for(const [child, distance] of node.children) {
                ikDown(child);
                posSum = posSum.add(reach(node.pos, child.pos, distance));
            }
            node.pos = posSum.scale(1 / node.children.length);
            break;
    }
}
function ikUp(node: IKNode, newPos: Vec3): void {
    node.pos = newPos;
    switch(node.kind) {
        case 'loose':
        case 'target':
            // do nothing;
            break;
        case 'internal':
            for(const [child, edgeLength] of node.children) {
                ikUp(child, reach(child.pos, node.pos, edgeLength));
            }
            break;
    }
}
function ikIterate(node: IKNode, times: number = 1): void {
    const rootPos = node.pos;
    for(let i = 0; i < times; ++i) {
        ikDown(node);
        ikUp(node, rootPos);
    }
}

function main(): void {
    const BODY_SECTIONS = 16, SECTION_SPACING = 16, HEAD_SIZE = 10;
    const LEG_SECTIONS = 2, LEG_SECTION_LENGTH = 32, LEG_POSITIONS = [1, 6];
    const Z_HEIGHT = 32;
    const MAX_MOVEMENT_SPEED = 2, FOOT_MOVEMENT_SPEED = 6, STEP_ANGLE = Math.PI / 8;
    const IK_ITERATIONS = 16;
    
    const canvas = document.getElementById('the_canvas') as HTMLCanvasElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d')!;
    
    const bodyParts = buildChain(BODY_SECTIONS, new Vec3(100, 100, Z_HEIGHT), new Vec3(SECTION_SPACING, 0, 0), false)
        .map((node, i) => ({
            node,
            radius: i === 0 ? HEAD_SIZE : 4 * HEAD_SIZE * i * (BODY_SECTIONS - i) ** 2 / (BODY_SECTIONS ** 3),
        }));
    
    const legs: {bodySection: number, maxLength: number, stepAngle: number, nodes: IKNode[], footNode: Extract<IKNode, {kind: 'target'}>, footTarget: Vec3}[] = [];
    for(let bodySection of LEG_POSITIONS) {
        for(let sign = -1; sign <= 1; sign += 2) {
            const part = bodyParts[bodySection].node as Extract<IKNode, {kind: 'internal'}>;
            const nodes = buildChain(LEG_SECTIONS, part.pos, new Vec3(0, sign * LEG_SECTION_LENGTH, 0), true);
            const footNode = nodes[nodes.length - 1] as Extract<IKNode, {kind: 'target'}>;
            legs.push({
                bodySection,
                maxLength: LEG_SECTION_LENGTH * LEG_SECTIONS,
                stepAngle: sign * STEP_ANGLE,
                nodes: [part, ...nodes],
                footNode,
                footTarget: footNode.pos,
            });
            part.children.push([nodes[0], LEG_SECTION_LENGTH]);
        }
    }
    
    function calculateStep(leg: typeof legs[number]): Vec3 {
        const i = leg.bodySection;
        const orientation = bodyParts[i - 1].node.pos.sub(bodyParts[i + 1].node.pos);
        const xyLength = Math.sqrt(leg.maxLength ** 2 - Z_HEIGHT ** 2);
        const offset = orientation.scale(xyLength / orientation.norm()).rotateXY(leg.stepAngle);
        return bodyParts[i].node.pos.add(offset).setZ(0);
    }
    
    let mouse = bodyParts[0].node.pos;
    document.onmousemove = e => {
        mouse = new Vec3(e.clientX, e.clientY, Z_HEIGHT);
    };
    
    function drawLine(line: Vec3[]): void {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for(let i = 1; i < line.length; ++i) {
            ctx.lineTo(line[i].x, line[i].y);
        }
        ctx.stroke();
    }
    
    function render(): void {
        const root = bodyParts[0].node;
        const distance = root.pos.sub(mouse).norm();
        if(distance >= 1) {
            const target = reach(mouse, root.pos, Math.min(distance, MAX_MOVEMENT_SPEED));
            ikUp(root, target);
        }
        
        for(const leg of legs) {
            const {footNode} = leg;
            const i = leg.bodySection;
            const bodyPart = bodyParts[i].node;
            if(leg.footTarget.sub(bodyPart.pos).norm() > leg.maxLength) {
                leg.footTarget = calculateStep(leg);
            }
            const footTravelDistance = footNode.goal.sub(leg.footTarget).norm();
            if(footTravelDistance >= 1) {
                const amount = Math.min(footTravelDistance, FOOT_MOVEMENT_SPEED);
                footNode.goal = reach(leg.footTarget, footNode.goal, amount);
            }
        }
        
        ikIterate(root, IK_ITERATIONS);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'black';
        drawLine(bodyParts.map(part => part.node.pos));
        
        for(const leg of legs) {
            drawLine(leg.nodes.map(node => node.pos));
        }
        
        for(const part of bodyParts) {
            ctx.beginPath();
            ctx.arc(part.node.pos.x, part.node.pos.y, part.radius, 0, 2 * Math.PI);
            ctx.stroke();
        }
        
        /*
        ctx.strokeStyle = 'red';
        for(const leg of legs) {
            const p = bodySections[leg.bodySection];
            const q = calculateStep(leg);
            drawLine([p, q]);
        }*/
        
        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
}
