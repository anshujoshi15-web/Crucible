// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract PayoutSplitter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address[4] public payees;
    uint256[4] public shares = [uint256(1500), 5500, 2000, 1000];
    mapping(address asset => uint256) public totalReleased;
    mapping(address asset => mapping(uint256 tier => uint256)) public released;

    constructor(address[4] memory recipients) {
        payees = recipients;
    }

    receive() external payable {}

    // A zero asset address selects native ETH. Anyone can trigger a payment to its fixed recipient.
    function release(address asset, uint256 tier) external nonReentrant {
        address payee = payees[tier];
        uint256 balance = asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
        uint256 amount = Math.mulDiv(balance + totalReleased[asset], shares[tier], 10000) - released[asset][tier];
        if (amount == 0) return;
        released[asset][tier] += amount;
        totalReleased[asset] += amount;
        if (asset == address(0)) {
            (bool ok,) = payee.call{value: amount}("");
            require(ok, "ETH payment failed");
        } else {
            IERC20(asset).safeTransfer(payee, amount);
        }
    }
}

contract CrucibleRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum SeedStage { PRIVATE_SUBMITTED, INCUBATING_LOCKED, GRADUATED_PUBLIC }
    enum Action { VerifiedBranch, AISpecOrAudit, MilestoneProof }

    struct SeedPool {
        uint256 availableEvo;
        uint256 reservedEvo;
        bool commitmentLocked;
    }

    struct Seed {
        address originator;
        bytes32 commitment;
        SeedStage stage;
        SeedPool pool;
        address splitter;
    }

    struct Milestone {
        address recipient;
        uint256 rewardEvo;
        bool settled;
    }

    address public constant HOUSE_WALLET = 0x6736d2eA9807297F0e56967361B9410854B86a5f;
    IERC20 public immutable evo;
    address public immutable incubator;
    address public immutable quorumVerifier;
    address public immutable treasury;
    uint256 public immutable depositFee;
    uint16 public immutable curatorSkimBps;
    uint256[3] public actionFees;
    uint256 public nextSeedId = 1;
    uint256 public globalReserve;

    mapping(uint256 => Seed) public seeds;
    mapping(uint256 => mapping(bytes32 => Milestone)) public milestones;
    mapping(uint256 => mapping(address => bool)) public workspaceMembers;
    mapping(uint256 => mapping(address => uint256)) public curatorInvites;
    mapping(uint256 => mapping(address => uint256)) public refundableCuratorStake;
    mapping(uint256 => mapping(bytes32 => bool)) public paidActions;

    event SeedSubmitted(uint256 indexed seedId, address indexed originator, bytes32 commitment);
    event SeedAccepted(uint256 indexed seedId);
    event WorkspaceFeePaid(uint256 indexed seedId, bytes32 indexed receipt, Action action, uint256 amount);
    event CuratorAdmitted(uint256 indexed seedId, address indexed curator, uint256 skim);
    event ReserveFunded(address indexed payer, uint256 amount);
    event ReserveAllocated(uint256 indexed seedId, uint256 amount);
    event MilestoneReserved(uint256 indexed seedId, bytes32 indexed milestone, address recipient, uint256 amount);
    event MilestonePaid(uint256 indexed seedId, bytes32 indexed milestone);
    event SeedGraduated(uint256 indexed seedId, address indexed projectOwner, address splitter, bytes32 releaseDigest);

    modifier onlyIncubator() {
        require(msg.sender == incubator, "Incubator only");
        _;
    }

    constructor(
        IERC20 evoToken,
        address incubatorAccount,
        address verifier,
        address treasuryAccount,
        uint256 initialFee,
        uint256[3] memory fees,
        uint16 skimBps
    ) {
        require(address(evoToken).code.length != 0, "Invalid token");
        require(incubatorAccount == HOUSE_WALLET && verifier == HOUSE_WALLET, "House wallet required");
        require(treasuryAccount != address(0), "Zero treasury");
        require(initialFee != 0 && skimBps >= 100 && skimBps <= 200, "Invalid fees");
        for (uint256 i; i < fees.length; ++i) require(fees[i] != 0, "Zero action fee");
        evo = evoToken;
        incubator = incubatorAccount;
        quorumVerifier = verifier;
        treasury = treasuryAccount;
        depositFee = initialFee;
        actionFees = fees;
        curatorSkimBps = skimBps;
    }

    // The commitment binds a salted private record and its signed assignment agreement.
    function submitSeed(bytes32 commitment) external nonReentrant returns (uint256 seedId) {
        require(commitment != bytes32(0), "Missing commitment");
        seedId = nextSeedId++;
        Seed storage seed = seeds[seedId];
        seed.originator = msg.sender;
        seed.commitment = commitment;
        seed.pool.availableEvo = depositFee;
        workspaceMembers[seedId][msg.sender] = true;
        evo.safeTransferFrom(msg.sender, address(this), depositFee);
        emit SeedSubmitted(seedId, msg.sender, commitment);
    }

    function acceptSeed(uint256 seedId) external onlyIncubator {
        Seed storage seed = _seed(seedId);
        require(seed.stage == SeedStage.PRIVATE_SUBMITTED, "Already accepted");
        seed.stage = SeedStage.INCUBATING_LOCKED;
        seed.pool.commitmentLocked = true;
        emit SeedAccepted(seedId);
    }

    function setWorkspaceMember(uint256 seedId, address member, bool allowed) external onlyIncubator {
        _incubating(seedId);
        workspaceMembers[seedId][member] = allowed;
    }

    function payWorkspaceFee(uint256 seedId, Action action, bytes32 actionId) external nonReentrant {
        Seed storage seed = _incubating(seedId);
        require(workspaceMembers[seedId][msg.sender], "Member only");
        bytes32 receipt = keccak256(abi.encode(msg.sender, action, actionId));
        require(actionId != bytes32(0) && !paidActions[seedId][receipt], "Invalid or paid action");
        paidActions[seedId][receipt] = true;
        uint256 fee = actionFees[uint256(action)];
        seed.pool.availableEvo += fee;
        evo.safeTransferFrom(msg.sender, address(this), fee);
        emit WorkspaceFeePaid(seedId, receipt, action, fee);
    }

    function inviteCurator(uint256 seedId, address curator, uint256 stake) external onlyIncubator {
        _incubating(seedId);
        require(stake == 0 || Math.mulDiv(stake, curatorSkimBps, 10000) != 0, "Stake too small");
        curatorInvites[seedId][curator] = stake;
    }

    function acceptCuratorInvite(uint256 seedId, uint256 expectedStake) external nonReentrant {
        Seed storage seed = _incubating(seedId);
        uint256 stake = curatorInvites[seedId][msg.sender];
        require(stake != 0 && stake == expectedStake, "Invalid invitation");
        require(refundableCuratorStake[seedId][msg.sender] == 0, "Already admitted");
        delete curatorInvites[seedId][msg.sender];
        uint256 skim = Math.mulDiv(stake, curatorSkimBps, 10000);
        seed.pool.availableEvo += skim;
        refundableCuratorStake[seedId][msg.sender] += stake - skim;
        workspaceMembers[seedId][msg.sender] = true;
        evo.safeTransferFrom(msg.sender, address(this), stake);
        emit CuratorAdmitted(seedId, msg.sender, skim);
    }

    function withdrawCuratorStake(uint256 seedId) external nonReentrant {
        _seed(seedId);
        workspaceMembers[seedId][msg.sender] = false;
        uint256 amount = refundableCuratorStake[seedId][msg.sender];
        require(amount != 0, "No stake");
        delete refundableCuratorStake[seedId][msg.sender];
        evo.safeTransfer(msg.sender, amount);
    }

    // The operations vault can route its $EVO revenue share here.
    function fundReserve(uint256 amount) external nonReentrant {
        require(amount != 0, "Zero funding");
        globalReserve += amount;
        evo.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(msg.sender, amount);
    }

    function allocateReserve(uint256 seedId, uint256 amount) external onlyIncubator {
        Seed storage seed = _incubating(seedId);
        require(amount != 0 && amount <= globalReserve, "Insufficient reserve");
        globalReserve -= amount;
        seed.pool.availableEvo += amount;
        emit ReserveAllocated(seedId, amount);
    }

    function reserveMilestone(uint256 seedId, bytes32 id, address recipient, uint256 reward) external onlyIncubator {
        Seed storage seed = _incubating(seedId);
        require(id != bytes32(0) && recipient != address(0) && reward != 0, "Invalid milestone");
        require(milestones[seedId][id].recipient == address(0), "Milestone exists");
        require(seed.pool.availableEvo >= reward, "Insufficient Seed pool");
        seed.pool.availableEvo -= reward;
        seed.pool.reservedEvo += reward;
        milestones[seedId][id] = Milestone(recipient, reward, false);
        emit MilestoneReserved(seedId, id, recipient, reward);
    }

    function acceptMilestone(uint256 seedId, bytes32 id) external onlyIncubator nonReentrant {
        Seed storage seed = _incubating(seedId);
        Milestone storage milestone = milestones[seedId][id];
        require(milestone.recipient != address(0) && !milestone.settled, "Milestone unavailable");
        milestone.settled = true;
        seed.pool.reservedEvo -= milestone.rewardEvo;
        evo.safeTransfer(milestone.recipient, milestone.rewardEvo);
        emit MilestonePaid(seedId, id);
    }

    // The verifier checks private quorum evidence and commits to the exact release configuration.
    mapping(uint256 => bytes32) public approvedGraduation;

    function attestGraduation(uint256 seedId, bytes32 configurationHash) external {
        require(msg.sender == quorumVerifier, "Verifier only");
        _incubating(seedId);
        approvedGraduation[seedId] = configurationHash;
    }

    function graduationConfigurationHash(bytes32 releaseDigest, address builders, address curators)
        public pure returns (bytes32)
    {
        return keccak256(abi.encode(releaseDigest, builders, curators));
    }

    function graduateSeed(uint256 seedId, bytes32 releaseDigest, address builders, address curators)
        external onlyIncubator returns (address splitter)
    {
        Seed storage seed = _incubating(seedId);
        require(seed.pool.reservedEvo == 0, "Unsettled milestones");
        require(releaseDigest != bytes32(0) && builders != address(0) && curators != address(0), "Invalid release");
        require(approvedGraduation[seedId] == graduationConfigurationHash(releaseDigest, builders, curators), "Quorum required");

        seed.stage = SeedStage.GRADUATED_PUBLIC;
        globalReserve += seed.pool.availableEvo;
        seed.pool.availableEvo = 0;
        splitter = address(new PayoutSplitter([seed.originator, builders, curators, treasury]));
        seed.splitter = splitter;
        emit SeedGraduated(seedId, incubator, splitter, releaseDigest);
    }

    function _seed(uint256 seedId) private view returns (Seed storage seed) {
        seed = seeds[seedId];
        require(seed.originator != address(0), "Unknown Seed");
    }

    function _incubating(uint256 seedId) private view returns (Seed storage seed) {
        seed = _seed(seedId);
        require(seed.stage == SeedStage.INCUBATING_LOCKED, "Seed not incubating");
    }
}
