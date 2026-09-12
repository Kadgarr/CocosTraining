import { _decorator, Component, MeshRenderer, Material } from 'cc';
import { ColorType } from './Types';
const { ccclass, property } = _decorator;

@ccclass('BlockComponent')
export class BlockComponent extends Component {
    public row: number = 0;
    public col: number = 0;
    public colorType: ColorType = ColorType.WHITE;

    @property(MeshRenderer)
    public meshRenderer: MeshRenderer = null!;

    public init(row: number, col: number, colorType: ColorType, mat: Material) {
        this.row = row;
        this.col = col;
        this.colorType = colorType;

        if (this.meshRenderer && mat) {
            this.meshRenderer.material = mat;
        }
    }
}