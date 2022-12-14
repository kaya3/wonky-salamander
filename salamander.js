/**
 * Based on https://twitter.com/TheRujiK/status/969581641680195585
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var Vec3 = /** @class */ (function () {
    function Vec3(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    Vec3.prototype.setZ = function (z) {
        return new Vec3(this.x, this.y, z);
    };
    Vec3.prototype.norm = function () {
        return Math.hypot(this.x, this.y, this.z);
    };
    Vec3.prototype.add = function (other) {
        return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
    };
    Vec3.prototype.sub = function (other) {
        return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
    };
    Vec3.prototype.scale = function (factor) {
        return new Vec3(factor * this.x, factor * this.y, factor * this.z);
    };
    Vec3.prototype.normalize = function (length) {
        return this.scale(length / this.norm());
    };
    Vec3.prototype.rotateXY = function (angle) {
        var c = Math.cos(angle), s = Math.sin(angle);
        return new Vec3(c * this.x + s * this.y, -s * this.x + c * this.y, this.z);
    };
    return Vec3;
}());
/**
 * Moves `a` towards or away from `b` to reach the desired distance.
 */
function reach(a, b, distance) {
    var diff = a.sub(b);
    var diffNorm = diff.norm();
    if (diffNorm < 1e-6) {
        return a;
    }
    var scaledDiff = diff.scale(distance / diffNorm);
    return b.add(scaledDiff);
}
function iterateForwards(points, target, distance) {
    var n = points.length;
    points[0] = target;
    for (var i = 1; i < n; ++i) {
        points[i] = reach(points[i], points[i - 1], distance);
    }
}
function iterateBackwards(points, target, distance) {
    var n = points.length;
    points[n - 1] = target;
    for (var i = n - 2; i >= 0; --i) {
        points[i] = reach(points[i], points[i + 1], distance);
    }
}
function iterateForwardsAndBackwards(points, target, distance) {
    var end = points[points.length - 1];
    iterateForwards(points, target, distance);
    iterateBackwards(points, end, distance);
}
function buildChain(size, pos, delta, hasGoal) {
    var node = hasGoal ? {
        kind: 'target',
        pos: pos,
        goal: pos
    } : {
        kind: 'loose',
        pos: pos
    };
    var r = [node];
    for (var i = 1; i < size; ++i) {
        pos = pos.add(delta);
        node = {
            kind: 'internal',
            pos: pos,
            children: [[node, delta.norm()]]
        };
        r.push(node);
    }
    r.reverse();
    return r;
}
function ikDown(node) {
    switch (node.kind) {
        case 'loose':
            // do nothing
            break;
        case 'target':
            node.pos = node.goal;
            break;
        case 'internal':
            var posSum = new Vec3(0, 0, 0);
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var _b = _a[_i], child = _b[0], distance = _b[1];
                ikDown(child);
                posSum = posSum.add(reach(node.pos, child.pos, distance));
            }
            node.pos = posSum.scale(1 / node.children.length);
            break;
    }
}
function ikUp(node, newPos) {
    node.pos = newPos;
    switch (node.kind) {
        case 'loose':
        case 'target':
            // do nothing;
            break;
        case 'internal':
            for (var _i = 0, _a = node.children; _i < _a.length; _i++) {
                var _b = _a[_i], child = _b[0], edgeLength = _b[1];
                ikUp(child, reach(child.pos, node.pos, edgeLength));
            }
            break;
    }
}
function ikIterate(node, times) {
    if (times === void 0) { times = 1; }
    var rootPos = node.pos;
    for (var i = 0; i < times; ++i) {
        ikDown(node);
        ikUp(node, rootPos);
    }
}
function main() {
    var BODY_SECTIONS = 16, SECTION_SPACING = 16, HEAD_SIZE = 10;
    var LEG_SECTIONS = 2, LEG_SECTION_LENGTH = 32, LEG_POSITIONS = [1, 6];
    var Z_HEIGHT = 32;
    var MAX_MOVEMENT_SPEED = 2, FOOT_MOVEMENT_SPEED = 6, STEP_ANGLE = Math.PI / 8;
    var IK_ITERATIONS = 16;
    var canvas = document.getElementById('the_canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');
    var bodyParts = buildChain(BODY_SECTIONS, new Vec3(100, 100, Z_HEIGHT), new Vec3(SECTION_SPACING, 0, 0), false)
        .map(function (node, i) { return ({
        node: node,
        radius: i === 0 ? HEAD_SIZE : 4 * HEAD_SIZE * i * Math.pow((BODY_SECTIONS - i), 2) / (Math.pow(BODY_SECTIONS, 3))
    }); });
    var legs = [];
    for (var _i = 0, LEG_POSITIONS_1 = LEG_POSITIONS; _i < LEG_POSITIONS_1.length; _i++) {
        var bodySection = LEG_POSITIONS_1[_i];
        for (var sign = -1; sign <= 1; sign += 2) {
            var part = bodyParts[bodySection].node;
            var nodes = buildChain(LEG_SECTIONS, part.pos, new Vec3(0, sign * LEG_SECTION_LENGTH, 0), true);
            var footNode = nodes[nodes.length - 1];
            legs.push({
                bodySection: bodySection,
                maxLength: LEG_SECTION_LENGTH * LEG_SECTIONS,
                stepAngle: sign * STEP_ANGLE,
                nodes: __spreadArray([part], nodes, true),
                footNode: footNode,
                footTarget: footNode.pos
            });
            part.children.push([nodes[0], LEG_SECTION_LENGTH]);
        }
    }
    function calculateStep(leg) {
        var i = leg.bodySection;
        var orientation = bodyParts[i - 1].node.pos.sub(bodyParts[i + 1].node.pos);
        var xyLength = Math.sqrt(Math.pow(leg.maxLength, 2) - Math.pow(Z_HEIGHT, 2));
        var offset = orientation.scale(xyLength / orientation.norm()).rotateXY(leg.stepAngle);
        return bodyParts[i].node.pos.add(offset).setZ(0);
    }
    var mouse = bodyParts[0].node.pos;
    document.onmousemove = function (e) {
        mouse = new Vec3(e.clientX, e.clientY, Z_HEIGHT);
    };
    function drawLine(line) {
        ctx.beginPath();
        ctx.moveTo(line[0].x, line[0].y);
        for (var i = 1; i < line.length; ++i) {
            ctx.lineTo(line[i].x, line[i].y);
        }
        ctx.stroke();
    }
    function render() {
        var root = bodyParts[0].node;
        var distance = root.pos.sub(mouse).norm();
        if (distance >= 1) {
            var target = reach(mouse, root.pos, Math.min(distance, MAX_MOVEMENT_SPEED));
            ikUp(root, target);
        }
        for (var _i = 0, legs_1 = legs; _i < legs_1.length; _i++) {
            var leg = legs_1[_i];
            var footNode = leg.footNode;
            var i = leg.bodySection;
            var bodyPart = bodyParts[i].node;
            if (leg.footTarget.sub(bodyPart.pos).norm() > leg.maxLength) {
                leg.footTarget = calculateStep(leg);
            }
            var footTravelDistance = footNode.goal.sub(leg.footTarget).norm();
            if (footTravelDistance >= 1) {
                var amount = Math.min(footTravelDistance, FOOT_MOVEMENT_SPEED);
                footNode.goal = reach(leg.footTarget, footNode.goal, amount);
            }
        }
        ikIterate(root, IK_ITERATIONS);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'black';
        drawLine(bodyParts.map(function (part) { return part.node.pos; }));
        for (var _a = 0, legs_2 = legs; _a < legs_2.length; _a++) {
            var leg = legs_2[_a];
            drawLine(leg.nodes.map(function (node) { return node.pos; }));
        }
        for (var _b = 0, bodyParts_1 = bodyParts; _b < bodyParts_1.length; _b++) {
            var part = bodyParts_1[_b];
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
